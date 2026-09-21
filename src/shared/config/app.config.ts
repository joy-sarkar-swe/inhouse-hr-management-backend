/**
 * @fileoverview Centralized application configuration.
 *
 * ALL configurable values live here. Never read process.env directly
 * in any service, module, or processor. Import this config object instead.
 *
 * Sections:
 *  - Core (port, env, CORS)
 *  - JWT & Auth
 *  - Mail (SMTP)
 *  - Database (PostgreSQL / Prisma)
 *  - Redis (one entry per isolated DB index — see redis.client.ts)
 *  - Rate limiting / throttling
 *  - Storage (GCP Cloud Storage)
 *  - Cache (L1/L2 + Bloom filter)
 *  - Circuit breaker tunables
 *  - Application constants (APP_NAME, SUPPORT_EMAIL — env-configurable)
 *
 * @module shared/config
 */
import dotenv from 'dotenv';

dotenv.config();

interface AppConfig {
  // ── Core ─────────────────────────────────────────────────────────────────
  PORT: number;
  NODE_ENV:
    | 'production'
    | 'staging'
    | 'qa'
    | 'preprod'
    | 'development'
    | 'dev'
    | 'test';
  FRONTEND_URL: string;

  // ── JWT & Auth ────────────────────────────────────────────────────────────
  /** Short-lived access token TTL in seconds. Default: 900 (15 min). */
  JWT_EXPIRES_IN: number;
  /**
   * Long-lived refresh token TTL in seconds. Default: 604 800 (7 days).
   * Refresh tokens are rotated on each use — this is the per-token window.
   */
  JWT_REFRESH_EXPIRES_IN: number;
  JWT_SECRET: string;
  BCRYPT_SALT_ROUNDS: number;

  // ── Mail (SMTP / Nodemailer) ───────────────────────────────────────────────
  MAIL_HOST: string;
  MAIL_PORT: number;
  MAIL_USER: string;
  MAIL_PASS: string;
  MAIL_FROM_NAME: string;
  MAIL_FROM_EMAIL: string;

  // ── Database (PostgreSQL / Prisma) ────────────────────────────────────────
  DATABASE_URL: string;

  // ── Redis ─────────────────────────────────────────────────────────────────
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD: string;
  /** DB 1 — auth session tokens. */
  REDIS_DB_AUTH: number;
  /** DB 3 — sliding-window rate-limit counters. */
  REDIS_DB_THROTTLE: number;
  /** DB 4 — general-purpose transactional email queue. */
  REDIS_DB_EMAIL_QUEUE: number;
  /** DB 5 — auth/OTP email queue (isolated so it can't be starved by DB 4). */
  REDIS_DB_AUTH_EMAIL_QUEUE: number;
  /** DB 12 — GCS signed-URL cache + L2 cache + Bloom filter bitmaps. */
  REDIS_DB_SIGNED_URL_CACHE: number;

  // ── Proxy ─────────────────────────────────────────────────────────────────
  /** Comma-separated trusted proxy CIDR blocks/IPs allowed to set x-forwarded-for. */
  TRUSTED_PROXIES: string;

  // ── GCP Cloud Storage ─────────────────────────────────────────────────────
  GCP_PROJECT_ID: string;
  GCP_BUCKET_NAME: string;
  GCP_SERVICE_ACCOUNT_JSON: string;

  // ── Cache architecture (L1 in-process + L2 Redis + Bloom filter) ──────────
  CACHE_VERSION: string;
  CACHE_L1_MAX_SIZE: number;
  CACHE_L1_TTL_MS: number;
  CACHE_L2_DEFAULT_TTL_SECS: number;
  BLOOM_FILTER_ENABLED: boolean;

  // ── Bloom filter rebuild (scheduled cron) ─────────────────────────────────
  BLOOM_REBUILD_ENABLED: boolean;
  BLOOM_REBUILD_CRON: string;
  BLOOM_REBUILD_CHUNK_SIZE: number;
  BLOOM_REBUILD_LOCK_TTL_SECS: number;
  BLOOM_REBUILD_INTER_CHUNK_DELAY_MS: number;

  // ── Application constants (env-configurable brand strings) ────────────────
  APP_NAME: string;
  SUPPORT_EMAIL: string;

  // ── Circuit breaker tunables (email SMTP + GCS calls) ─────────────────────
  CB_ERROR_THRESHOLD_PERCENTAGE: number;
  CB_RESET_TIMEOUT_MS: number;
  CB_CALL_TIMEOUT_MS: number;
  CB_VOLUME_THRESHOLD: number;

  // ── Rate limiting ─────────────────────────────────────────────────────────
  THROTTLE_ENABLED: boolean;
}

// ─── Env-reading helpers ────────────────────────────────────────────────────

/** Read an environment variable as an integer, falling back to `fallback`. */
const int = (key: string, fallback = 0): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  return parseInt(raw, 10);
};

/** Read an environment variable as a string, falling back to `fallback`. */
const str = (key: string, fallback = ''): string =>
  process.env[key] ?? fallback;

/** Read an environment variable as a boolean (`'true'` or `'1'` → true). */
const bool = (key: string, fallback = false): boolean => {
  const raw = process.env[key];
  if (!raw) return fallback;
  return raw.toLowerCase() === 'true' || raw === '1';
};

/** Decode a Base64-encoded string if it looks encoded; return it as-is otherwise. */
const maybeDecodeBase64 = (val: string): string => {
  if (!val || val.trim().startsWith('{')) return val;
  try {
    return Buffer.from(val, 'base64').toString('utf8');
  } catch {
    return val;
  }
};

// ─── Config object (frozen at startup) ───────────────────────────────────────

const config: AppConfig = Object.freeze({
  // Core
  PORT: int('PORT', 3000),
  NODE_ENV: (process.env.NODE_ENV as AppConfig['NODE_ENV']) || 'development',
  FRONTEND_URL: str('FRONTEND_URL'),

  // JWT & Auth
  JWT_EXPIRES_IN: int('JWT_EXPIRES_IN', 900),
  JWT_REFRESH_EXPIRES_IN: int('JWT_REFRESH_EXPIRES_IN', 604_800),
  JWT_SECRET: str('JWT_SECRET'),
  BCRYPT_SALT_ROUNDS: int('BCRYPT_SALT_ROUNDS', 12),

  // Mail
  MAIL_HOST: str('MAIL_HOST'),
  MAIL_PORT: int('MAIL_PORT', 587),
  MAIL_USER: str('MAIL_USER'),
  MAIL_PASS: str('MAIL_PASS'),
  MAIL_FROM_NAME: str('MAIL_FROM_NAME'),
  MAIL_FROM_EMAIL: str('MAIL_FROM_EMAIL'),

  // Database
  DATABASE_URL: str('DATABASE_URL'),

  // Redis
  REDIS_HOST: str('REDIS_HOST', '127.0.0.1'),
  REDIS_PORT: int('REDIS_PORT', 6379),
  REDIS_PASSWORD: str('REDIS_PASSWORD'),
  REDIS_DB_AUTH: int('REDIS_DB_AUTH', 1),
  REDIS_DB_THROTTLE: int('REDIS_DB_THROTTLE', 3),
  REDIS_DB_EMAIL_QUEUE: int('REDIS_DB_EMAIL_QUEUE', 4),
  REDIS_DB_AUTH_EMAIL_QUEUE: int('REDIS_DB_AUTH_EMAIL_QUEUE', 5),
  REDIS_DB_SIGNED_URL_CACHE: int('REDIS_DB_SIGNED_URL_CACHE', 12),

  // Proxy
  TRUSTED_PROXIES: str('TRUSTED_PROXIES'),

  // GCP Cloud Storage
  GCP_PROJECT_ID: str('GCP_PROJECT_ID'),
  GCP_BUCKET_NAME: str('GCP_BUCKET_NAME'),
  GCP_SERVICE_ACCOUNT_JSON: maybeDecodeBase64(str('GCP_SERVICE_ACCOUNT_JSON')),

  // Cache architecture
  CACHE_VERSION: str('CACHE_VERSION', 'v1'),
  CACHE_L1_MAX_SIZE: int('CACHE_L1_MAX_SIZE', 5000),
  CACHE_L1_TTL_MS: int('CACHE_L1_TTL_MS', 30_000),
  CACHE_L2_DEFAULT_TTL_SECS: int('CACHE_L2_DEFAULT_TTL_SECS', 300),
  BLOOM_FILTER_ENABLED: bool('BLOOM_FILTER_ENABLED', true),

  // Bloom filter rebuild
  BLOOM_REBUILD_ENABLED: bool('BLOOM_REBUILD_ENABLED', true),
  BLOOM_REBUILD_CRON: str('BLOOM_REBUILD_CRON', '0 3 * * *'),
  BLOOM_REBUILD_CHUNK_SIZE: int('BLOOM_REBUILD_CHUNK_SIZE', 5000),
  BLOOM_REBUILD_LOCK_TTL_SECS: int('BLOOM_REBUILD_LOCK_TTL_SECS', 600),
  BLOOM_REBUILD_INTER_CHUNK_DELAY_MS: int(
    'BLOOM_REBUILD_INTER_CHUNK_DELAY_MS',
    50,
  ),

  // Application constants
  APP_NAME: str('APP_NAME', 'My App'),
  SUPPORT_EMAIL: str('SUPPORT_EMAIL', 'support@example.com'),

  // Circuit breaker
  CB_ERROR_THRESHOLD_PERCENTAGE: int('CB_ERROR_THRESHOLD_PERCENTAGE', 50),
  CB_RESET_TIMEOUT_MS: int('CB_RESET_TIMEOUT_MS', 30_000),
  CB_CALL_TIMEOUT_MS: int('CB_CALL_TIMEOUT_MS', 10_000),
  CB_VOLUME_THRESHOLD: int('CB_VOLUME_THRESHOLD', 5),

  // Rate limiting
  THROTTLE_ENABLED: bool('THROTTLE_ENABLED', true),
});

export default config;
