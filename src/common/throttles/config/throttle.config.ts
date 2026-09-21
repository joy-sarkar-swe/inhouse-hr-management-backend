/**
 * @fileoverview Centralized, environment-driven throttle configuration.
 *
 * All rate-limit thresholds, TTLs, and algorithm parameters are loaded from
 * environment variables with safe defaults. Importing this module in guards
 * replaces every hardcoded constant and makes the system tunable without
 * a code deploy.
 *
 * ── Sliding-window token-bucket parameters ───────────────────────────────────
 *
 * Each entry exposes:
 *  - LIMIT        : maximum requests allowed within the window
 *  - TTL_SECONDS  : rolling window size in seconds
 *  - KEY_PREFIX   : Redis key namespace
 *  - BLOCK_SECONDS: optional hard-block duration once limit is exceeded
 *
 * ── Progressive backoff parameters ──────────────────────────────────────────
 *
 *  - BACKOFF_BASE_MS      : added delay per failed attempt (ms)
 *  - BACKOFF_MAX_MS       : cap on total added delay (ms)
 *  - BLOCK_THRESHOLD      : attempt count that triggers a hard block
 *  - BLOCK_DURATION_SECS  : hard-block TTL in seconds
 *
 * To add a throttle for a new endpoint, add a new frozen const here (follow
 * the existing naming pattern) and reference it from a guard under
 * `src/common/throttles/`.
 *
 * @module throttles/config
 */

/** Read an env var as integer with a fallback. */
const envInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** Read an env var as string with a fallback. */
const envStr = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;

// ─── Trusted Proxy ────────────────────────────────────────────────────────────

/**
 * Comma-separated list of trusted proxy CIDR blocks / IPs.
 * Only IPs in this list are trusted to set x-forwarded-for / CF-Connecting-IP.
 *
 * Default: Cloudflare IPv4 ranges + localhost.
 * Override via TRUSTED_PROXIES env var.
 */
export const TRUSTED_PROXIES: readonly string[] = Object.freeze(
  envStr(
    'TRUSTED_PROXIES',
    '127.0.0.1,::1,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,' +
      // Cloudflare IPv4
      '173.245.48.0/20,103.21.244.0/22,103.22.200.0/22,103.31.4.0/22,' +
      '141.101.64.0/18,108.162.192.0/18,190.93.240.0/20,188.114.96.0/20,' +
      '197.234.240.0/22,198.41.128.0/17,162.158.0.0/15,104.16.0.0/13,' +
      '104.24.0.0/14,172.64.0.0/13,131.0.72.0/22',
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

// ─── Progressive Backoff ──────────────────────────────────────────────────────

export const PROGRESSIVE_BACKOFF = Object.freeze({
  /** Added delay per failed attempt in milliseconds. */
  BASE_MS: envInt('THROTTLE_BACKOFF_BASE_MS', 500),
  /** Maximum synthetic delay cap in milliseconds. */
  MAX_MS: envInt('THROTTLE_BACKOFF_MAX_MS', 5_000),
  /** Attempt count that triggers hard-block. */
  BLOCK_THRESHOLD: envInt('THROTTLE_BLOCK_THRESHOLD', 10),
  /** Duration of hard-block in seconds. */
  BLOCK_DURATION_SECS: envInt('THROTTLE_BLOCK_DURATION_SECS', 900), // 15 min
});

// ─── Auth throttles ────────────────────────────────────────────────────────────

/** Login — per IP+UA+device hybrid key. */
export const LOGIN = Object.freeze({
  LIMIT: envInt('THROTTLE_LOGIN_LIMIT', 5),
  TTL_SECONDS: envInt('THROTTLE_LOGIN_TTL_SECS', 300),
  KEY_PREFIX: 'throttle:login:ip',
  BLOCK_SECONDS: envInt('THROTTLE_LOGIN_BLOCK_SECS', 900),
});

/** Login — per-email scope (anti-identity-spam). */
export const LOGIN_EMAIL = Object.freeze({
  LIMIT: envInt('THROTTLE_LOGIN_EMAIL_LIMIT', 10),
  TTL_SECONDS: envInt('THROTTLE_LOGIN_EMAIL_TTL_SECS', 600),
  KEY_PREFIX: 'throttle:login:email',
});

/** Registration — per IP+UA+device. */
export const REGISTER = Object.freeze({
  LIMIT: envInt('THROTTLE_REGISTER_LIMIT', 3),
  TTL_SECONDS: envInt('THROTTLE_REGISTER_TTL_SECS', 3600),
  KEY_PREFIX: 'throttle:register:ip',
  BLOCK_SECONDS: envInt('THROTTLE_REGISTER_BLOCK_SECS', 86_400),
});

/** Registration — per email identity. */
export const REGISTER_EMAIL = Object.freeze({
  LIMIT: envInt('THROTTLE_REGISTER_EMAIL_LIMIT', 3),
  TTL_SECONDS: envInt('THROTTLE_REGISTER_EMAIL_TTL_SECS', 86_400),
  KEY_PREFIX: 'throttle:register:email',
});

/** Resend verification email — per IP+UA+device. */
export const RESEND_VERIFICATION_EMAIL = Object.freeze({
  LIMIT: envInt('THROTTLE_RESEND_VERIF_LIMIT', 3),
  TTL_SECONDS: envInt('THROTTLE_RESEND_VERIF_TTL_SECS', 3600),
  KEY_PREFIX: 'throttle:resend-verif:ip',
});

/** Resend verification email — per email identity. */
export const RESEND_VERIFICATION_EMAIL_IDENTITY = Object.freeze({
  LIMIT: envInt('THROTTLE_RESEND_VERIF_EMAIL_LIMIT', 3),
  TTL_SECONDS: envInt('THROTTLE_RESEND_VERIF_EMAIL_TTL_SECS', 3600),
  KEY_PREFIX: 'throttle:resend-verif:email',
});

/** Forgot-password — per IP+UA+device. */
export const FORGOT_PASSWORD = Object.freeze({
  LIMIT: envInt('THROTTLE_FORGOT_PW_LIMIT', 3),
  TTL_SECONDS: envInt('THROTTLE_FORGOT_PW_TTL_SECS', 300),
  KEY_PREFIX: 'throttle:forgot-pw:ip',
  BLOCK_SECONDS: envInt('THROTTLE_FORGOT_PW_BLOCK_SECS', 900),
});

/** Forgot-password — per email identity (anti-multi-IP spray). */
export const FORGOT_PASSWORD_EMAIL = Object.freeze({
  LIMIT: envInt('THROTTLE_FORGOT_PW_EMAIL_LIMIT', 5),
  TTL_SECONDS: envInt('THROTTLE_FORGOT_PW_EMAIL_TTL_SECS', 600),
  KEY_PREFIX: 'throttle:forgot-pw:email',
});

/** OTP verification — per IP+UA+device (strict). */
export const VERIFY_OTP = Object.freeze({
  LIMIT: envInt('THROTTLE_VERIFY_OTP_LIMIT', 5),
  TTL_SECONDS: envInt('THROTTLE_VERIFY_OTP_TTL_SECS', 300),
  KEY_PREFIX: 'throttle:verify-otp:ip',
  BLOCK_SECONDS: envInt('THROTTLE_VERIFY_OTP_BLOCK_SECS', 900),
});

/** OTP verification — per email identity (anti-multi-IP spray). */
export const VERIFY_OTP_EMAIL = Object.freeze({
  LIMIT: envInt('THROTTLE_VERIFY_OTP_EMAIL_LIMIT', 8),
  TTL_SECONDS: envInt('THROTTLE_VERIFY_OTP_EMAIL_TTL_SECS', 300),
  KEY_PREFIX: 'throttle:verify-otp:email',
});

/** Reset-password — per IP+UA+device. */
export const RESET_PASSWORD = Object.freeze({
  LIMIT: envInt('THROTTLE_RESET_PW_LIMIT', 5),
  TTL_SECONDS: envInt('THROTTLE_RESET_PW_TTL_SECS', 300),
  KEY_PREFIX: 'throttle:reset-pw:ip',
  BLOCK_SECONDS: envInt('THROTTLE_RESET_PW_BLOCK_SECS', 900),
});

/** Reset-password — per email identity. */
export const RESET_PASSWORD_EMAIL = Object.freeze({
  LIMIT: envInt('THROTTLE_RESET_PW_EMAIL_LIMIT', 8),
  TTL_SECONDS: envInt('THROTTLE_RESET_PW_EMAIL_TTL_SECS', 300),
  KEY_PREFIX: 'throttle:reset-pw:email',
});

/** Change-password — per authenticated userId. */
export const CHANGE_PASSWORD = Object.freeze({
  LIMIT: envInt('THROTTLE_CHANGE_PW_LIMIT', 3),
  TTL_SECONDS: envInt('THROTTLE_CHANGE_PW_TTL_SECS', 3600),
  KEY_PREFIX: 'throttle:change-pw:user',
});

/** Refresh-token — per IP+UA+device (prevent refresh token spray). */
export const REFRESH_TOKEN = Object.freeze({
  LIMIT: envInt('THROTTLE_REFRESH_TOKEN_LIMIT', 30),
  TTL_SECONDS: envInt('THROTTLE_REFRESH_TOKEN_TTL_SECS', 300),
  KEY_PREFIX: 'throttle:refresh-token:ip',
  BLOCK_SECONDS: envInt('THROTTLE_REFRESH_TOKEN_BLOCK_SECS', 900),
});

/** Change-email initiate — per authenticated userId. */
export const CHANGE_EMAIL = Object.freeze({
  LIMIT: envInt('THROTTLE_CHANGE_EMAIL_LIMIT', 3),
  TTL_SECONDS: envInt('THROTTLE_CHANGE_EMAIL_TTL_SECS', 3600),
  KEY_PREFIX: 'throttle:change-email:user',
});

/** Authenticated endpoints general user throttle. */
export const AUTHENTICATED_USER = Object.freeze({
  LIMIT: envInt('THROTTLE_AUTH_USER_LIMIT', 100),
  TTL_SECONDS: envInt('THROTTLE_AUTH_USER_TTL_SECS', 60),
  KEY_PREFIX: 'throttle:auth-user',
});

// ─── User profile throttles ───────────────────────────────────────────────────

/** User profile update — per authenticated userId. */
export const PROFILE_WRITE = Object.freeze({
  LIMIT: envInt('THROTTLE_PROFILE_WRITE_LIMIT', 20),
  TTL_SECONDS: envInt('THROTTLE_PROFILE_WRITE_TTL_SECS', 3600),
  KEY_PREFIX: 'throttle:profile:write:user',
});

/** Avatar upload/delete — per authenticated userId (storage ops are expensive). */
export const PROFILE_AVATAR = Object.freeze({
  LIMIT: envInt('THROTTLE_PROFILE_AVATAR_LIMIT', 10),
  TTL_SECONDS: envInt('THROTTLE_PROFILE_AVATAR_TTL_SECS', 3600),
  KEY_PREFIX: 'throttle:profile:avatar:user',
});

// ─── Public API throttles ─────────────────────────────────────────────────────

/** Public unauthenticated reads — per IP+UA. Generic guard for any new public endpoint. */
export const PUBLIC_API = Object.freeze({
  LIMIT: envInt('THROTTLE_PUBLIC_API_LIMIT', 100),
  TTL_SECONDS: envInt('THROTTLE_PUBLIC_API_TTL_SECS', 60),
  KEY_PREFIX: 'throttle:public:ip',
});
