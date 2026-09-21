/**
 * @fileoverview PasswordResetTokenService — short-lived single-use tokens
 * for the post-OTP password-reset step.
 *
 * Why this exists:
 *   The forgot-password flow used to ask the user for the OTP twice (once to
 *   verify, once again when setting the new password). The standard practical
 *   pattern is: verify OTP → server issues a short-lived reset token →
 *   user submits `{ reset_token, new_password }` to actually set the password.
 *   No second OTP entry. This works identically for web + mobile clients.
 *
 * Storage layout (REDIS_DB_AUTH, alongside JWT session tokens):
 *
 *   Forward index:    auth:password_reset:<token>     → <user_id>   (TTL 10 min)
 *   Back-pointer:     auth:password_reset_user:<user> → <token>     (TTL 10 min)
 *
 *   The back-pointer enables single-active-token-per-user enforcement: when
 *   the user re-clicks "forgot password" before completing the reset, we can
 *   find and invalidate any prior live token by `user_id` alone.
 *
 * Atomicity:
 *   - `consumeToken()` uses Redis `GETDEL` (Redis 6.2+) for atomic single-use
 *     semantics — even under concurrent requests, only ONE call can succeed
 *     with the same token. The back-pointer is then best-effort-cleaned.
 *   - `issueToken()` writes both keys in a `MULTI` pipeline so they appear
 *     atomically to any concurrent reader.
 *
 * @module auth-service/services
 */
import { Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { RedisClientService } from 'src/common/redis/redis.client';

/** 10 minutes — matches the existing OTP TTL. */
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 10 * 60;

const FORWARD_KEY_PREFIX = 'auth:password_reset:';
const BACK_POINTER_KEY_PREFIX = 'auth:password_reset_user:';

export interface IssuedResetToken {
  token: string;
  expiresInSeconds: number;
}

@Injectable()
export class PasswordResetTokenService {
  private readonly logger = new Logger(PasswordResetTokenService.name);

  constructor(private readonly redis: RedisClientService) {}

  /**
   * Issue a fresh reset token for a user. Any prior live token for the same
   * user is invalidated first (single-active-token-per-user policy).
   */
  async issueToken(userId: string): Promise<IssuedResetToken> {
    await this.revokeForUser(userId);

    const token = randomBytes(32).toString('hex');
    const client = this.redis.getClientAuth();

    await client
      .multi()
      .set(
        this.forwardKey(token),
        userId,
        'EX',
        PASSWORD_RESET_TOKEN_TTL_SECONDS,
      )
      .set(
        this.backPointerKey(userId),
        token,
        'EX',
        PASSWORD_RESET_TOKEN_TTL_SECONDS,
      )
      .exec();

    this.logger.debug(
      `[PasswordResetToken] Issued for user_id=${userId} ttl=${PASSWORD_RESET_TOKEN_TTL_SECONDS}s`,
    );
    return { token, expiresInSeconds: PASSWORD_RESET_TOKEN_TTL_SECONDS };
  }

  /**
   * Atomically consume a reset token, returning the user_id it was bound to
   * (or null if missing / expired / already used). The forward key is removed
   * inside the same Redis round-trip via `GETDEL`; the back-pointer is cleaned
   * up best-effort afterwards.
   */
  async consumeToken(token: string): Promise<string | null> {
    const client = this.redis.getClientAuth();
    // GETDEL — atomic single-use consumption (Redis 6.2+).
    const userId = await client.getdel(this.forwardKey(token));
    if (!userId) {
      this.logger.debug(
        '[PasswordResetToken] Consume miss — token not found or already used.',
      );
      return null;
    }

    // Best-effort cleanup of the back-pointer. It would TTL out anyway, but
    // removing it now keeps the keyspace tidy and prevents revokeForUser()
    // from chasing a stale forward key it can't find.
    try {
      await client.del(this.backPointerKey(userId));
    } catch (err) {
      this.logger.warn(
        `[PasswordResetToken] Back-pointer cleanup failed (non-fatal) for user_id=${userId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    this.logger.debug(`[PasswordResetToken] Consumed for user_id=${userId}`);
    return userId;
  }

  /**
   * Invalidate any live reset token for a user. Used:
   *  - Inside issueToken() so only one reset is ever in flight per user.
   *  - Inside forgotPassword() so re-clicking "forgot password" cancels the
   *    earlier token even when no new OTP has been verified yet.
   *
   * No-op when no token is in flight.
   */
  async revokeForUser(userId: string): Promise<void> {
    const client = this.redis.getClientAuth();
    const existingToken = await client.get(this.backPointerKey(userId));
    if (!existingToken) return;

    await client.del(
      this.forwardKey(existingToken),
      this.backPointerKey(userId),
    );
    this.logger.debug(
      `[PasswordResetToken] Revoked prior token for user_id=${userId}`,
    );
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private forwardKey(token: string): string {
    return `${FORWARD_KEY_PREFIX}${token}`;
  }

  private backPointerKey(userId: string): string {
    return `${BACK_POINTER_KEY_PREFIX}${userId}`;
  }
}
