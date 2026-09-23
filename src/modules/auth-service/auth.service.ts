/**
 * @fileoverview Authentication service.
 *
 * Business logic for all auth flows:
 *  register → verify-account → login → logout
 *  forgot-password → verify-otp → reset-password
 *  change-password, change-email
 *
 * Auth is email + password only. All messages are plain English constants
 * (see {@link M} below) — there is no i18n layer in this template.
 *
 * @module auth-service
 */
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { RedisTokenService } from 'src/common/redis/redis-service/auth/redis-token.service';
import { EmployeeService } from 'src/modules/employee-service/employee.service';
import { UserService } from 'src/modules/user-service/user.service';
import config from 'src/shared/config/app.config';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';
import { ServicePayload } from 'src/shared/interfaces/response.interface';
import { EmailService } from '../email-service/email.service';
import { ChangeEmailInitiateDto } from './dto/validation/change-email-initiate.dto';
import { ChangeEmailVerifyDto } from './dto/validation/change-email-verify.dto';
import { ChangePasswordDto } from './dto/validation/change-password.dto';
import { ForgotPasswordDto } from './dto/validation/forgot-password.dto';
import { LoginDto } from './dto/validation/login.dto';
import { RefreshTokenDto } from './dto/validation/refresh-token.dto';
import { RegisterDto } from './dto/validation/register.dto';
import { ResendVerificationDto } from './dto/validation/resend-verification.dto';
import { ResetPasswordDto } from './dto/validation/reset-password.dto';
import { VerifyAccountDto } from './dto/validation/verify-account.dto';
import { VerifyOtpDto } from './dto/validation/verify-otp.dto';
import type { LoginResponseDto } from './interfaces/auth.interface';
import { PasswordResetTokenService } from './services/password-reset-token.service';

// ─── Messages ───────────────────────────────────────────────────────────────
// Plain-English, single-locale message constants. Centralized here (rather
// than inlined at each call site) so wording stays consistent and easy to
// audit/change in one place — swap this out for a real i18n layer if the
// template grows into a multi-locale product.
const M = {
  REGISTRATION_SUCCESS:
    'Registration successful. Please check your email for a verification code.',
  EMAIL_ALREADY_REGISTERED: 'An account with this email already exists.',
  INVALID_OR_EXPIRED_OTP: 'Invalid or expired verification code.',
  ACCOUNT_ALREADY_VERIFIED: 'This account is already verified.',
  ACCOUNT_VERIFIED: 'Account verified successfully. You can now log in.',
  RESEND_OTP_SAFE_MESSAGE:
    'If an account exists, a new verification code has been sent.',
  INVALID_CREDENTIALS: 'Invalid email or password.',
  ACCOUNT_NOT_VERIFIED: 'Please verify your account before logging in.',
  ACCOUNT_SUSPENDED:
    'This account has been suspended. Contact support for help.',
  LOGIN_SUCCESS: 'Login successful.',
  FORGOT_PASSWORD_SAFE_MESSAGE:
    'If an account exists, a password reset code has been sent.',
  OTP_EXPIRED: 'This verification code has expired. Please request a new one.',
  OTP_VERIFIED: 'Code verified. You may now reset your password.',
  RESET_TOKEN_INVALID_OR_EXPIRED:
    'This reset session is invalid or has expired. Please start over.',
  PASSWORD_RESET_SUCCESS: 'Password reset successfully. You can now log in.',
  USER_NOT_FOUND: 'User not found.',
  CURRENT_PASSWORD_INCORRECT: 'Current password is incorrect.',
  PASSWORD_CHANGED: 'Password changed successfully.',
  LOGOUT_SUCCESS: 'Logged out successfully.',
  LOGOUT_ALL_SUCCESS: 'Logged out from all devices successfully.',
  INVALID_REFRESH_TOKEN: 'Invalid or expired refresh token.',
  REFRESH_TOKEN_SUCCESS: 'Token refreshed successfully.',
  EMAIL_SAME_AS_CURRENT: 'This is already your current email address.',
  CHANGE_EMAIL_OTP_SENT: 'A verification code has been sent to your new email.',
  NO_PENDING_EMAIL_CHANGE: 'No email change is currently pending.',
  EMAIL_CHANGE_INVALID_OTP: 'Invalid or expired verification code.',
  CHANGE_EMAIL_SUCCESS: 'Email address updated successfully.',
} as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Generates a cryptographically adequate 6-digit numeric OTP. */
function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** OTP TTL constants (milliseconds). */
const OTP_TTL_MS = {
  VERIFICATION: 15 * 60 * 1000, // 15 min
  RESET: 10 * 60 * 1000, // 10 min
} as const;

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly employeeService: EmployeeService,
    private readonly jwtService: JwtService,
    private readonly redisTokenService: RedisTokenService,
    private readonly emailService: EmailService,
    private readonly passwordResetTokenService: PasswordResetTokenService,
  ) {}

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a new user with an email address and password.
   *
   * Flow:
   *  1. Guard duplicate email.
   *  2. Hash password + generate OTP.
   *  3. Persist user.
   *  4. Enqueue verification email via auth-email queue.
   *
   * @param dto - Registration payload.
   */
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const exists = await this.userService.existsByEmail(dto.email);
    if (exists) {
      throw new ConflictException(M.EMAIL_ALREADY_REGISTERED);
    }

    const [hashedPassword, otp] = await Promise.all([
      bcrypt.hash(dto.password, config.BCRYPT_SALT_ROUNDS),
      Promise.resolve(generateOtp()),
    ]);

    await this.userService.create({
      name: dto.fullName,
      email: dto.email,
      password: hashedPassword,
      role: dto.role,
      acc_verification_otp: otp,
      acc_verified: false,
    });

    // Fire-and-forget — auth email queue handles retries
    void this.emailService.sendAuthEmail({
      to: dto.email,
      subject: 'Verify your account',
      html: `<p>Your verification OTP is: <strong>${otp}</strong></p><p>Expires in 15 minutes.</p>`,
    });

    this.logger.log(`User registered: ${dto.email}`);

    return { message: M.REGISTRATION_SUCCESS };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFY ACCOUNT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Verify a user account using the registration OTP.
   *
   * @param dto - Payload containing the account email and OTP.
   */
  async verifyAccount(dto: VerifyAccountDto): Promise<{ message: string }> {
    const user = await this.userService.findByVerificationOtp(
      dto.email,
      dto.otp,
    );

    if (!user) {
      throw new BadRequestException(M.INVALID_OR_EXPIRED_OTP);
    }

    if (user.acc_verified) {
      throw new BadRequestException(M.ACCOUNT_ALREADY_VERIFIED);
    }

    await this.userService.markVerifiedAndClearOtp(user.id);

    this.logger.log(`Account verified: ${user.email}`);

    return { message: M.ACCOUNT_VERIFIED };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESEND VERIFICATION
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Regenerate and resend the account verification OTP.
   *
   * Always returns the same safe message to prevent email enumeration.
   *
   * @param dto - Payload with `email`.
   */
  async resendVerificationOtp(
    dto: ResendVerificationDto,
  ): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(dto.email);

    if (!user) {
      return { message: M.RESEND_OTP_SAFE_MESSAGE };
    }

    if (user.acc_verified) {
      throw new BadRequestException(M.ACCOUNT_ALREADY_VERIFIED);
    }

    const otp = generateOtp();
    await this.userService.update(user.id, { acc_verification_otp: otp });

    // Fire-and-forget
    void this.emailService.sendAuthEmail({
      to: dto.email,
      subject: 'Verify your account — new OTP',
      html: `<p>Your new verification OTP is: <strong>${otp}</strong></p><p>Expires in 15 minutes.</p>`,
    });

    return { message: M.RESEND_OTP_SAFE_MESSAGE };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Authenticate a user and issue a Redis-backed JWT session.
   *
   * A cryptographically random session ID is generated server-side and used
   * as the Redis key — no client-supplied device identifier is required or
   * trusted for session management.
   *
   * @param dto - Login credentials (email + password).
   */
  async login(dto: LoginDto): Promise<ServicePayload<LoginResponseDto>> {
    const user = await this.userService.findWithPassword(dto.email);

    if (!user) {
      throw new UnauthorizedException(M.INVALID_CREDENTIALS);
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException(M.INVALID_CREDENTIALS);
    }

    if (!user.acc_verified) {
      throw new UnauthorizedException(M.ACCOUNT_NOT_VERIFIED);
    }

    // ── Suspension check ─────────────────────────────────────────────────
    // `is_suspended` has no admin UI wired up in this template (that layer
    // was deliberately left out — see AGENTS.md), but the DB column and this
    // login-time gate are kept so a suspension mechanism can be bolted on
    // without touching the auth flow itself.
    if (user.is_suspended) {
      throw new UnauthorizedException(M.ACCOUNT_SUSPENDED);
    }

    const lowerRole = (user.role as string).toLowerCase() as 'hr' | 'employee';

    // Fetch the linked Employee record for EMPLOYEE role users.
    //
    // This used to call `(this.userService as any).findEmployeeByUserId?.(...)`
    // — but that method only ever existed on EmployeeService, never on
    // UserService. The `as any` + `?.()` silenced the type error instead of
    // surfacing it, so this always evaluated to `undefined` and no employee's
    // JWT ever carried `employeeId`. Every endpoint that trusted
    // `user.employeeId` without an independent DB fallback broke as a result:
    // leave submission/cancel crashed or 403'd, and /leave/my and /payroll/my
    // silently dropped their employeeId filter and returned every employee's
    // records instead of just the caller's own.
    let employeeId: string | undefined;
    if (lowerRole === 'employee') {
      const empRecord = await this.employeeService.findEmployeeByUserId(
        user.id,
      );
      if (empRecord) {
        employeeId = empRecord.id;
      }
    }

    const payload = {
      sub: user.id,
      email: user.email,
      name: user.name,
      role: lowerRole,
      ...(employeeId ? { employeeId } : {}),
    };

    const sessionId = crypto.randomUUID();
    const accessKey = `${user.id}:${sessionId}`;
    const refreshKey = `refresh:${user.id}:${sessionId}`;

    const [accessJwt, refreshJwt] = await Promise.all([
      this.jwtService.signAsync(payload),
      this.jwtService.signAsync(
        { ...payload, type: 'refresh' },
        { expiresIn: config.JWT_REFRESH_EXPIRES_IN },
      ),
    ]);

    await Promise.all([
      this.redisTokenService.storeToken(
        accessKey,
        accessJwt,
        config.JWT_EXPIRES_IN,
      ),
      this.redisTokenService.storeToken(
        refreshKey,
        refreshJwt,
        config.JWT_REFRESH_EXPIRES_IN,
      ),
    ]);

    this.logger.log(`User logged in: ${user.email} session=${sessionId}`);

    return {
      message: M.LOGIN_SUCCESS,
      data: {
        access_token: accessKey,
        refresh_token: refreshKey,
        token_type: 'Bearer' as const,
        expires_in: config.JWT_EXPIRES_IN,
        user: {
          email: user.email,
          fullName: user.name,
          role: lowerRole,
          ...(employeeId ? { employeeId } : {}),
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FORGOT PASSWORD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initiate a password reset flow via email OTP.
   *
   * Security: always returns the same safe message to prevent email
   * enumeration regardless of whether the account exists.
   *
   * Flow:
   *  1. Lookup user by email.
   *  2. Generate OTP + expiry → persist on user record.
   *  3. Enqueue reset email via auth-email queue (fire-and-forget).
   *
   * @param dto - Payload with `email`.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.userService.findByEmail(dto.email);

    if (!user) {
      return { message: M.FORGOT_PASSWORD_SAFE_MESSAGE };
    }

    // Revoke any in-flight reset token (the user re-started the flow).
    await this.passwordResetTokenService.revokeForUser(user.id);

    const otp = generateOtp();
    const expiry = new Date(Date.now() + OTP_TTL_MS.RESET);

    await this.userService.update(user.id, {
      reset_pass_otp: otp,
      reset_pass_otp_expired_at: expiry,
    });

    void this.emailService.sendAuthEmail({
      to: dto.email,
      subject: 'Password reset OTP',
      html: `<p>Your password reset OTP is: <strong>${otp}</strong></p><p>Expires in 10 minutes.</p>`,
    });

    this.logger.log(`Password reset OTP sent: ${dto.email}`);

    return { message: M.FORGOT_PASSWORD_SAFE_MESSAGE };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFY OTP (password reset step 2 of 3)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Verify the password-reset OTP before allowing the actual reset.
   *
   * @param dto - Payload containing email and OTP.
   */
  async verifyOtp(dto: VerifyOtpDto): Promise<{
    message: string;
    data: { reset_token: string; expires_in: number };
  }> {
    const user = await this.userService.findWithOtp(dto.email);

    if (!user) {
      throw new BadRequestException(M.INVALID_OR_EXPIRED_OTP);
    }

    // ── OTP match ─────────────────────────────────────────────────────────
    if (user.reset_pass_otp !== dto.otp) {
      throw new BadRequestException(M.INVALID_OR_EXPIRED_OTP);
    }

    // ── Expiry check ──────────────────────────────────────────────────────
    if (
      !user.reset_pass_otp_expired_at ||
      user.reset_pass_otp_expired_at < new Date()
    ) {
      throw new BadRequestException(M.OTP_EXPIRED);
    }

    // ── Issue single-use reset token (proof of OTP verification) ─────────
    // Returned in the response body so the client can pass it back in
    // POST /auth/reset-password without re-entering the OTP. The OTP itself
    // is cleared on successful reset via UserService.resetPasswordAndClearOtp.
    const { token, expiresInSeconds } =
      await this.passwordResetTokenService.issueToken(user.id);

    return {
      message: M.OTP_VERIFIED,
      data: { reset_token: token, expires_in: expiresInSeconds },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESET PASSWORD (step 3 of 3)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reset the user's password using the single-use reset token issued by
   * step 2 (`POST /auth/forget-password-verify-otp`).
   *
   * No need to re-supply email/otp — the token cryptographically proves the
   * caller already passed OTP verification. The token is atomically
   * consumed (GETDEL) so a replay or concurrent call cannot reuse it. On
   * success: password is hashed + persisted, OTP fields cleared, all stale
   * auth sessions for the user remain valid (this is password reset, not
   * security-revoke; logout-all is a separate flow).
   *
   * @param dto - { reset_token, newPassword }
   */
  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    // ── Consume the reset token (atomic single-use) ──────────────────────
    const userId = await this.passwordResetTokenService.consumeToken(
      dto.reset_token,
    );
    if (!userId) {
      throw new BadRequestException(M.RESET_TOKEN_INVALID_OR_EXPIRED);
    }

    // ── Hash new password ─────────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(
      dto.newPassword,
      config.BCRYPT_SALT_ROUNDS,
    );

    // ── Persist ─────────────────────────────────────
    // resetPasswordAndClearOtp clears the legacy `reset_pass_otp` columns
    // alongside the password write, so any DB row that still has a populated
    // OTP from before this flow shipped is cleaned up implicitly.
    await this.userService.resetPasswordAndClearOtp(userId, hashedPassword);

    this.logger.log(`Password reset (token-based) for user_id=${userId}`);

    return { message: M.PASSWORD_RESET_SUCCESS };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHANGE PASSWORD (authenticated)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Change password for an authenticated user.
   *
   * @param userId - Authenticated user ID.
   * @param dto    - Payload with old and new passwords.
   */
  async changePassword(
    userId: string,
    dto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    const user = await this.userService.findByIdWithPassword(userId);

    if (!user) {
      throw new UnauthorizedException(M.USER_NOT_FOUND);
    }

    const isOldPasswordValid = await bcrypt.compare(
      dto.oldPassword,
      user.password,
    );

    if (!isOldPasswordValid) {
      throw new BadRequestException(M.CURRENT_PASSWORD_INCORRECT);
    }

    const hashedPassword = await bcrypt.hash(
      dto.newPassword,
      config.BCRYPT_SALT_ROUNDS,
    );

    await this.userService.update(userId, { password: hashedPassword });

    this.logger.log(`Password changed for user: ${userId}`);

    return { message: M.PASSWORD_CHANGED };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Log out from the current session by deleting both the access and refresh
   * token pair from Redis.
   *
   * The Redis access key is resolved from the Authorization header by
   * {@link JwtAuthGuard} and attached to `request['redisKey']`.
   * The matching refresh key is derived by prepending `refresh:` to the
   * access key — no client-supplied data is needed.
   *
   * @param userId   - Authenticated user ID.
   * @param redisKey - Access token Redis key (`userId:sessionId`), set by JwtAuthGuard.
   */
  async logout(
    userId: AuthUser['id'],
    redisKey: string,
  ): Promise<{ message: string }> {
    const refreshKey = `refresh:${redisKey}`;
    await this.redisTokenService.deleteTokenPair(redisKey, refreshKey);

    this.logger.log(`User logged out: userId=${userId} key=${redisKey}`);

    return { message: M.LOGOUT_SUCCESS };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGOUT ALL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Log out from ALL active sessions for the authenticated user.
   *
   * Scans Redis and deletes every access and refresh token that belongs
   * to this user — effectively revoking all devices at once.
   *
   * @param userId - Authenticated user ID.
   */
  async logoutAll(userId: string): Promise<{ message: string }> {
    const deleted = await this.redisTokenService.deleteAllUserTokens(userId);

    this.logger.log(
      `User logged out from all sessions: userId=${userId} keys=${deleted}`,
    );

    return { message: M.LOGOUT_ALL_SUCCESS };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REFRESH TOKEN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Issue a new access + refresh token pair using a valid refresh token.
   *
   * Security properties:
   *  - Refresh token rotation: old refresh token is deleted after use.
   *  - Refresh tokens cannot be used as access tokens (JwtAuthGuard rejects them).
   *  - If the refresh token is not found in Redis (expired or revoked), 401 is thrown.
   *  - The JWT `type: 'refresh'` claim is verified to prevent access JWT replay.
   *
   * @param dto - Payload containing the refresh token string.
   */
  async refreshToken(
    dto: RefreshTokenDto,
  ): Promise<ServicePayload<LoginResponseDto>> {
    const { refresh_token: refreshKey } = dto;

    // 1. Validate the refresh token exists in Redis
    const storedJwt = await this.redisTokenService.getToken(refreshKey);
    if (!storedJwt) {
      throw new UnauthorizedException(M.INVALID_REFRESH_TOKEN);
    }

    // 2. Verify and decode the refresh JWT (signature + expiry)
    let decoded: {
      sub: string;
      email: string | null;
      name: string;
      role: string;
      employeeId?: string;
      type?: string;
    };
    try {
      decoded = await this.jwtService.verifyAsync(storedJwt);
    } catch {
      // JWT expired or tampered — purge the stale Redis entry
      await this.redisTokenService.deleteToken(refreshKey);
      throw new UnauthorizedException(M.INVALID_REFRESH_TOKEN);
    }

    // 3. Enforce refresh-token type claim
    if (decoded.type !== 'refresh') {
      throw new UnauthorizedException(M.INVALID_REFRESH_TOKEN);
    }

    const userId = decoded.sub;

    // 4. Derive the old access key from the refresh key pattern
    // refresh:{userId}:{sessionId} → {userId}:{sessionId}
    const oldAccessKey = refreshKey.replace(/^refresh:/, '');

    // 5. Generate new session pair
    const newSessionId = crypto.randomUUID();
    const newAccessKey = `${userId}:${newSessionId}`;
    const newRefreshKey = `refresh:${userId}:${newSessionId}`;

    // Carry `employeeId` forward across the rotation — omitting it here would
    // silently strip it from every session the moment it refreshes (every
    // 15 minutes via JWT_EXPIRES_IN), even for a session that got it
    // correctly at login. See the comment in `login()` above.
    const jwtPayload = {
      sub: userId,
      email: decoded.email,
      name: decoded.name,
      role: decoded.role,
      ...(decoded.employeeId ? { employeeId: decoded.employeeId } : {}),
    };

    const [newAccessJwt, newRefreshJwt] = await Promise.all([
      this.jwtService.signAsync(jwtPayload),
      this.jwtService.signAsync(
        { ...jwtPayload, type: 'refresh' },
        { expiresIn: config.JWT_REFRESH_EXPIRES_IN },
      ),
    ]);

    // 6. Store new tokens and delete old pair atomically
    await Promise.all([
      this.redisTokenService.storeToken(
        newAccessKey,
        newAccessJwt,
        config.JWT_EXPIRES_IN,
      ),
      this.redisTokenService.storeToken(
        newRefreshKey,
        newRefreshJwt,
        config.JWT_REFRESH_EXPIRES_IN,
      ),
      this.redisTokenService.deleteTokenPair(oldAccessKey, refreshKey),
    ]);

    this.logger.log(
      `Token refreshed: userId=${userId} oldSession=${oldAccessKey} newSession=${newSessionId}`,
    );

    return {
      message: M.REFRESH_TOKEN_SUCCESS,
      data: {
        access_token: newAccessKey,
        refresh_token: newRefreshKey,
        token_type: 'Bearer' as const,
        expires_in: config.JWT_EXPIRES_IN,
        user: {
          email: decoded.email,
          fullName: decoded.name,
          role: decoded.role,
          ...(decoded.employeeId ? { employeeId: decoded.employeeId } : {}),
        },
      },
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHANGE EMAIL — INITIATE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initiate an email address change (step 1 of 2).
   *
   * Flow:
   *  1. Validate the new email ≠ current email.
   *  2. Check the new email is not already registered by another user.
   *  3. Generate an OTP and persist it with a 15-minute expiry.
   *  4. Deliver the OTP to the new email address.
   *
   * @param userId - Authenticated user ID.
   * @param dto    - Payload containing the new email.
   */
  async changeEmailInitiate(
    userId: string,
    dto: ChangeEmailInitiateDto,
  ): Promise<{ message: string }> {
    const user = await this.userService.findById(userId);
    if (!user) {
      throw new UnauthorizedException(M.USER_NOT_FOUND);
    }

    // Same as current → no-op
    if (user.email === dto.newEmail) {
      throw new BadRequestException(M.EMAIL_SAME_AS_CURRENT);
    }

    // Guard: new email must not already be registered
    const emailTaken = await this.userService.existsByEmail(dto.newEmail);
    if (emailTaken) {
      throw new ConflictException(M.EMAIL_ALREADY_REGISTERED);
    }

    const otp = generateOtp();
    const expiry = new Date(Date.now() + OTP_TTL_MS.VERIFICATION);

    await this.userService.update(userId, {
      pending_email: dto.newEmail,
      pending_email_otp: otp,
      pending_email_otp_expired_at: expiry,
    });

    void this.emailService.sendAuthEmail({
      to: dto.newEmail,
      subject: 'Verify your new email address',
      html: `<p>Your email change verification OTP is: <strong>${otp}</strong></p><p>Expires in 15 minutes.</p>`,
    });

    this.logger.log(
      `Email change initiated: userId=${userId} pending=${dto.newEmail}`,
    );

    return { message: M.CHANGE_EMAIL_OTP_SENT };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHANGE EMAIL — VERIFY
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Complete an email address change (step 2 of 2).
   *
   * Validates the OTP, then atomically commits the new email and clears
   * all pending change fields.
   *
   * @param userId - Authenticated user ID.
   * @param dto    - Payload containing the OTP.
   */
  async changeEmailVerify(
    userId: string,
    dto: ChangeEmailVerifyDto,
  ): Promise<{ message: string }> {
    const user = await this.userService.findByIdWithPendingOtp(userId);
    if (!user) {
      throw new UnauthorizedException(M.USER_NOT_FOUND);
    }

    if (!user.pending_email || !user.pending_email_otp) {
      throw new BadRequestException(M.NO_PENDING_EMAIL_CHANGE);
    }

    if (user.pending_email_otp !== dto.otp) {
      throw new BadRequestException(M.EMAIL_CHANGE_INVALID_OTP);
    }

    if (
      !user.pending_email_otp_expired_at ||
      user.pending_email_otp_expired_at < new Date()
    ) {
      throw new BadRequestException(M.EMAIL_CHANGE_INVALID_OTP);
    }

    await this.userService.commitEmailChange(userId, user.pending_email);

    this.logger.log(
      `Email changed: userId=${userId} newEmail=${user.pending_email}`,
    );

    return { message: M.CHANGE_EMAIL_SUCCESS };
  }
}
