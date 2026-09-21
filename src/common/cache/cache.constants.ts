/**
 * @fileoverview Cache module tunables — all values read from env at startup.
 *
 * L2 key format: `l2:<version>:<namespace>:<id>`
 *
 * The `CACHE_VERSION` segment (default `'v1'`) allows a cold-start of all L2
 * cache entries on deploy without requiring a Redis FLUSHDB. When a Prisma
 * model field is added, bump `CACHE_VERSION` (v1 → v2) in `.env` so that all
 * reads miss the stale keys and repopulate with the new shape automatically.
 * Old versioned keys expire via their normal TTLs — no manual cleanup needed.
 *
 * @module common/cache
 */
import config from 'src/shared/config/app.config';

/** Max entries in the in-process L1 LRU. Oldest entry evicted on overflow. */
export const L1_MAX_SIZE = config.CACHE_L1_MAX_SIZE;

/** Default L1 TTL in milliseconds (before jitter). */
export const L1_TTL_MS = config.CACHE_L1_TTL_MS;

/** Default L2 Redis TTL in seconds (before jitter). */
export const L2_DEFAULT_TTL_SECS = config.CACHE_L2_DEFAULT_TTL_SECS;

/** ±20% TTL jitter to spread Redis key expiry across the fleet. */
export const TTL_JITTER_FACTOR = 0.2;

/** Bloom filter size in bits (2 MB — ~2M items at 0.1% FPR with 10 hash fns). */
export const BLOOM_BITS = 16_000_000;

/** Number of Bloom hash functions. */
export const BLOOM_K = 10;

/** Redis key prefix for Bloom filter bit arrays. */
export const BLOOM_KEY_PREFIX = 'bloom:';

/**
 * Redis key prefix for L2 cache entries, including the schema version segment.
 *
 * Format: `l2:<CACHE_VERSION>:` → full key: `l2:v1:<namespace>:<id>`
 * Bump `CACHE_VERSION` in `.env` on deploy to invalidate stale cache shapes.
 */
export const L2_KEY_PREFIX = `l2:${config.CACHE_VERSION}:`;
