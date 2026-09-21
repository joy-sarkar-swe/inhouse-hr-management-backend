/**
 * @fileoverview User Data Access Object (DAO).
 *
 * Responsibility: ALL and ONLY database operations for the User model.
 * The DAO layer sits between PrismaService and UserService:
 *
 *   Controller → Service (business logic) → DAO (DB queries) → Prisma → PostgreSQL
 *
 * Why a separate DAO layer?
 *  - Single Responsibility: service contains business rules, DAO contains
 *    query logic. Swap Prisma for raw SQL tomorrow — only DAO changes.
 *  - Security: password field is NEVER returned by default. Every method
 *    that needs the password hash must explicitly call `findWithPassword`.
 *  - Testability: mock the DAO in service unit tests with zero DB overhead.
 *  - Reuse: multiple services can inject UserDAO without duplicating queries.
 *
 * Password field policy:
 *  - Default `select` omits `password` everywhere except `findWithPassword`.
 *  - This prevents accidental password leakage through API responses.
 *
 * Caching strategy:
 *  - `findById` — Bloom-guarded (`user` namespace) + L1/L2 cached (5 min TTL).
 *    Bloom is warmed on init with all user IDs. Prevents unnecessary DB hits
 *    when services look up deleted or non-existent user IDs.
 *  - `findByEmail` — L1/L2 cached (5 min TTL, no Bloom — keyed by email string).
 *  - All write paths invalidate the relevant cache entries.
 *  - Sensitive methods (findWithPassword, findWithOtp, findByIdWithPendingOtp)
 *    are NOT cached — they include fields that must always be fresh.
 *
 * @module user-service/dao
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma, User, UserRole } from '@prisma/client';
import { BloomFilterService } from 'src/common/cache/bloom-filter.service';
import { CacheOrchestratorService } from 'src/common/cache/cache-orchestrator.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE SELECT OBJECTS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Safe public projection — password and OTP fields are excluded.
 * Used for all reads that do not require password comparison.
 */
const PUBLIC_SELECT = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  avatar_public_id: true,
  acc_verified: true,
  role: true,
  is_suspended: true,
  created_at: true,
  updated_at: true,
  // Intentionally omitted: password, acc_verification_otp,
  //                         reset_pass_otp, reset_pass_otp_expired_at
} satisfies Prisma.UserSelect;

/**
 * Full projection including password — only used internally for auth.
 * Never expose the result of this select over the wire.
 */
const WITH_PASSWORD_SELECT = {
  ...PUBLIC_SELECT,
  password: true,
} satisfies Prisma.UserSelect;

/**
 * OTP projection — includes OTP fields needed for verification flows.
 */
const WITH_OTP_SELECT = {
  ...PUBLIC_SELECT,
  acc_verification_otp: true,
  reset_pass_otp: true,
  reset_pass_otp_expired_at: true,
} satisfies Prisma.UserSelect;

/**
 * Pending contact-change projection — includes fields for the email-change OTP flow.
 */
const WITH_PENDING_OTP_SELECT = {
  ...PUBLIC_SELECT,
  pending_email: true,
  pending_email_otp: true,
  pending_email_otp_expired_at: true,
} satisfies Prisma.UserSelect;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

/** Public user shape returned by most DAO reads. */
export type PublicUser = Omit<
  User,
  | 'password'
  | 'acc_verification_otp'
  | 'reset_pass_otp'
  | 'reset_pass_otp_expired_at'
  | 'pending_email'
  | 'pending_email_otp'
  | 'pending_email_otp_expired_at'
>;

/** User shape with password — for auth use only. */
export type UserWithPassword = PublicUser & { password: string };

/** User shape with OTP fields — for verification flows. */
export type UserWithOtp = PublicUser & {
  acc_verification_otp: string | null;
  reset_pass_otp: string | null;
  reset_pass_otp_expired_at: Date | null;
};

/** User shape with pending contact-change OTP fields — for the email-change flow. */
export type UserWithPendingOtp = PublicUser & {
  pending_email: string | null;
  pending_email_otp: string | null;
  pending_email_otp_expired_at: Date | null;
};

/** Data required to create a new user record. */
export interface CreateUserData {
  name: string;
  email: string;
  password: string; // pre-hashed
  role: UserRole;
  avatar?: string;
  acc_verification_otp?: string;
  acc_verified?: boolean;
}

/** Partial data for updating a user record. */
export interface UpdateUserData {
  name?: string;
  email?: string;
  avatar?: string | null;
  avatar_public_id?: string | null;
  password?: string; // pre-hashed
  acc_verified?: boolean;
  acc_verification_otp?: string | null;
  reset_pass_otp?: string | null;
  reset_pass_otp_expired_at?: Date | null;
  is_suspended?: boolean;
  // Email change flow
  pending_email?: string | null;
  pending_email_otp?: string | null;
  pending_email_otp_expired_at?: Date | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// CACHE NAMESPACES
// ─────────────────────────────────────────────────────────────────────────────

const NS = {
  /** Bloom filter namespace — all user IDs, warmed on init. */
  bloom: 'user',
  id: 'user:id',
  email: 'user:email',
} as const;

const L2_TTL = 300; // 5 minutes — users update profiles occasionally

// ─────────────────────────────────────────────────────────────────────────────
// DAO
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class UserDAO implements OnModuleInit {
  private readonly logger = new Logger(UserDAO.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheOrchestratorService,
    private readonly bloom: BloomFilterService,
  ) {}

  /** Warm the Bloom filter with all user IDs on startup (non-blocking). */
  onModuleInit(): void {
    this.warmBloom().catch(() => undefined);
  }

  private async warmBloom(): Promise<void> {
    const rows = await this.prisma.user.findMany({ select: { id: true } });
    await this.bloom.rebuild(
      NS.bloom,
      rows.map((r) => r.id),
    );
    this.logger.debug(`[UserDAO] Bloom warmed with ${rows.length} user IDs`);
  }

  /**
   * Persist a new user to the database and register the ID in the Bloom filter.
   *
   * @param data - Validated, pre-hashed user creation data.
   * @returns The created public user (no password).
   */
  async create(data: CreateUserData): Promise<PublicUser> {
    const created = await this.prisma.user.create({
      data,
      select: PUBLIC_SELECT,
    });
    void this.bloom.add(NS.bloom, created.id).catch(() => undefined);
    return created;
  }

  /**
   * Find a user by their UUID primary key — Bloom-guarded + L1/L2 cached.
   * Returns null immediately when the Bloom filter confirms the ID is absent.
   * Never caches password, OTP, or sensitive fields — only PUBLIC_SELECT.
   *
   * @param id - UUID of the user.
   */
  async findById(id: string): Promise<PublicUser | null> {
    const exists = await this.bloom.mightExist(NS.bloom, id);
    if (!exists) return null;
    return this.cache.get(
      NS.id,
      id,
      () =>
        this.prisma.user.findUnique({ where: { id }, select: PUBLIC_SELECT }),
      { l2TtlSecs: L2_TTL, bypassBloom: true },
    );
  }

  /**
   * Find a user by email — public projection, L1/L2 cached.
   * Use `findWithPassword` when you need the hash for comparison.
   *
   * @param email - Email address to search.
   */
  async findByEmail(email: string): Promise<PublicUser | null> {
    return this.cache.get(
      NS.email,
      email,
      () =>
        this.prisma.user.findUnique({
          where: { email },
          select: PUBLIC_SELECT,
        }),
      { l2TtlSecs: L2_TTL, bypassBloom: true },
    );
  }

  /**
   * Find a user by email including the password hash.
   * ONLY used by auth service for login and password change flows.
   * Result MUST NOT be serialised into any API response.
   *
   * @param email - Email address to search.
   */
  async findWithPassword(email: string): Promise<UserWithPassword | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: WITH_PASSWORD_SELECT,
    });
  }

  /**
   * Find a user by ID including the password hash.
   * Used by change-password flow where we need to verify old password.
   *
   * @param id - UUID of the user.
   */
  async findByIdWithPassword(id: string): Promise<UserWithPassword | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: WITH_PASSWORD_SELECT,
    });
  }

  /**
   * Find a user by email including OTP fields.
   * Used by verification and password reset flows.
   *
   * @param email - Email address to search.
   */
  async findWithOtp(email: string): Promise<UserWithOtp | null> {
    return this.prisma.user.findUnique({
      where: { email },
      select: WITH_OTP_SELECT,
    });
  }

  /**
   * Find a user by their account verification email and OTP.
   * Used during account verification to locate the target user.
   *
   * @param email - Registration email address.
   * @param otp   - 6-digit verification OTP sent to that email.
   */
  async findByVerificationOtp(
    email: string,
    otp: string,
  ): Promise<UserWithOtp | null> {
    return this.prisma.user.findFirst({
      where: { email, acc_verification_otp: otp },
      select: WITH_OTP_SELECT,
    });
  }

  /**
   * Update a user record by ID — invalidates user:id and user:email caches.
   * Returns the updated public user.
   *
   * @param id - UUID of the user to update.
   * @param data - Fields to update.
   */
  async update(id: string, data: UpdateUserData): Promise<PublicUser> {
    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: PUBLIC_SELECT,
    });
    void Promise.all([
      this.cache.invalidate(NS.id, id),
      updated.email
        ? this.cache.invalidate(NS.email, updated.email)
        : Promise.resolve(),
    ]).catch(() => undefined);
    return updated;
  }

  /**
   * Bulk-invalidate sensitive fields after password reset.
   * Clears OTP, OTP expiry in a single atomic update.
   * Also invalidates the user cache since acc_verified may have changed.
   *
   * @param id - UUID of the user.
   * @param newPassword - Pre-hashed new password.
   */
  async resetPasswordAndClearOtp(
    id: string,
    newPassword: string,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        password: newPassword,
        reset_pass_otp: null,
        reset_pass_otp_expired_at: null,
      },
    });
    void this.cache.invalidate(NS.id, id).catch(() => undefined);
  }

  /**
   * Mark account as verified and clear the verification OTP — invalidates user cache.
   *
   * @param id - UUID of the user.
   */
  async markVerifiedAndClearOtp(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        acc_verified: true,
        acc_verification_otp: null,
      },
    });
    void this.cache.invalidate(NS.id, id).catch(() => undefined);
  }

  /**
   * Find a user by ID including pending email OTP fields.
   * Used by the change-email verify flow.
   *
   * @param id - UUID of the user.
   */
  async findByIdWithPendingOtp(id: string): Promise<UserWithPendingOtp | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: WITH_PENDING_OTP_SELECT,
    });
  }

  /**
   * Commit an email change: atomically update email and clear pending fields.
   * Invalidates user:id and both old + new user:email cache keys.
   *
   * @param id       - UUID of the user.
   * @param newEmail - The verified new email address.
   */
  async commitEmailChange(id: string, newEmail: string): Promise<void> {
    // Fetch old email from cache before committing the change
    const before = await this.findById(id);
    await this.prisma.user.update({
      where: { id },
      data: {
        email: newEmail,
        pending_email: null,
        pending_email_otp: null,
        pending_email_otp_expired_at: null,
      },
    });
    void Promise.all([
      this.cache.invalidate(NS.id, id),
      before?.email
        ? this.cache.invalidate(NS.email, before.email)
        : Promise.resolve(),
      this.cache.invalidate(NS.email, newEmail),
    ]).catch(() => undefined);
  }

  /**
   * Check if an email address is already registered.
   * Lightweight existence check — no model hydration.
   *
   * @param email - Email to check.
   */
  async existsByEmail(email: string): Promise<boolean> {
    const count = await this.prisma.user.count({ where: { email } });
    return count > 0;
  }
}
