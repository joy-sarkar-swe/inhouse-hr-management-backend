/**
 * @fileoverview Redis-backed Bloom filter using plain SETBIT / GETBIT.
 *
 * No RedisBloom / Redis module required — uses the native bit commands.
 * Hash function: inline 32-bit MurmurHash3 (no npm dep).
 *
 * Fail-open: Redis errors cause `mightExist()` to return `true` so callers
 * always fall through to the DB rather than silently dropping traffic.
 *
 * @module common/cache
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RedisClientService } from '../redis/redis.client';
import { BLOOM_BITS, BLOOM_K, BLOOM_KEY_PREFIX } from './cache.constants';
import config from 'src/shared/config/app.config';

// ─── Inline MurmurHash3 (32-bit) ─────────────────────────────────────────────

/**
 * 32-bit MurmurHash3 — deterministic hash used to compute bit positions.
 *
 * @param key  - String value to hash.
 * @param seed - Seed integer; varying seed produces independent hash functions.
 * @returns Unsigned 32-bit hash value.
 */
function murmur3(key: string, seed: number): number {
  let h = seed >>> 0;
  const bytes = Buffer.from(key, 'utf8');
  const len = bytes.length;
  let i = 0;
  while (i <= len - 4) {
    let k =
      (bytes[i] |
        (bytes[i + 1] << 8) |
        (bytes[i + 2] << 16) |
        (bytes[i + 3] << 24)) >>>
      0;
    k = Math.imul(k, 0xcc9e2d51) >>> 0;
    k = ((k << 15) | (k >>> 17)) >>> 0;
    k = Math.imul(k, 0x1b873593) >>> 0;
    h ^= k;
    h = ((h << 13) | (h >>> 19)) >>> 0;
    h = (Math.imul(h, 5) + 0xe6546b64) >>> 0;
    i += 4;
  }
  let remaining = 0;
  switch (len & 3) {
    case 3:
      remaining ^= bytes[i + 2] << 16; // fall through
    case 2:
      remaining ^= bytes[i + 1] << 8; // fall through
    case 1:
      remaining ^= bytes[i];
      h ^=
        ((Math.imul(remaining >>> 0, 0xcc9e2d51) >>> 0) << 15) |
        ((Math.imul(remaining >>> 0, 0xcc9e2d51) >>> 0) >>> 17);
  }
  h ^= len;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * Compute the BLOOM_K bit positions for a given value.
 *
 * Each position is derived from a separate MurmurHash3 seed so the k positions
 * are pairwise-independent within each namespace's bit array.
 *
 * Exported so that `BloomRebuildService` can use the same hash function when
 * writing to shadow rebuild keys without going through the full service API.
 *
 * @param value - String to hash (typically a UUID or slug).
 * @returns Array of BLOOM_K bit offsets in `[0, BLOOM_BITS)`.
 */
export function bloomBits(value: string): number[] {
  return Array.from(
    { length: BLOOM_K },
    (_, i) => murmur3(value, i) % BLOOM_BITS,
  );
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class BloomFilterService implements OnModuleInit {
  private readonly logger = new Logger(BloomFilterService.name);
  private readonly enabled: boolean;

  constructor(private readonly redis: RedisClientService) {
    this.enabled = config.BLOOM_FILTER_ENABLED;
  }

  /** Logs a startup notice when the filter is disabled via config. */
  onModuleInit(): void {
    if (!this.enabled) {
      this.logger.debug('Bloom filter disabled (BLOOM_FILTER_ENABLED=false).');
    }
  }

  /**
   * Add a value to the Bloom filter for a given namespace.
   *
   * Sets the BLOOM_K bits derived from `value` in the Redis bit array
   * `bloom:<namespace>`. Silently swallows Redis errors (fail-open).
   *
   * @param namespace - Logical namespace (e.g. `'shop'`, `'user'`).
   * @param value     - String to add (typically a UUID).
   */
  async add(namespace: string, value: string): Promise<void> {
    if (!this.enabled) return;
    const key = `${BLOOM_KEY_PREFIX}${namespace}`;
    try {
      const client = this.redis.getClientSignedUrlCache();
      const pipeline = client.pipeline();
      for (const bit of bloomBits(value)) {
        pipeline.setbit(key, bit, 1);
      }
      await pipeline.exec();
    } catch (err) {
      this.logger.warn(
        `Bloom add failed for ns=${namespace}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Test whether a value is _possibly_ present in the Bloom filter.
   *
   * Returns `true`  — value was probably added (false-positive rate ≈ 0.1%).
   * Returns `false` — value is definitively absent; callers may skip the DB.
   *
   * Fail-open: Redis errors return `true` so callers always fall through to DB.
   * When the filter is disabled, always returns `true`.
   *
   * @param namespace - Logical namespace (e.g. `'shop'`, `'user'`).
   * @param value     - String to test.
   * @returns `true` if the value might exist; `false` if definitely absent.
   */
  async mightExist(namespace: string, value: string): Promise<boolean> {
    if (!this.enabled) return true; // disabled → always allow through
    const key = `${BLOOM_KEY_PREFIX}${namespace}`;
    try {
      const client = this.redis.getClientSignedUrlCache();
      const pipeline = client.pipeline();
      for (const bit of bloomBits(value)) {
        pipeline.getbit(key, bit);
      }
      const results = await pipeline.exec();
      if (!results) return true;
      return results.every(([err, bit]) => !err && bit === 1);
    } catch {
      return true; // fail open
    }
  }

  /**
   * Bulk-load a set of IDs into the Bloom filter for a namespace.
   *
   * Processes `values` in chunks of 500 to keep pipeline payloads bounded.
   * Called on `onModuleInit` by DAOs that own a Bloom namespace (e.g. ShopDAO,
   * ProductDAO, UserDAO) to warm the filter from the current DB state.
   *
   * @param namespace - Logical namespace key (e.g. `'shop'`, `'user'`).
   * @param values    - Array of string IDs (UUIDs or slugs) to add.
   */
  async rebuild(namespace: string, values: string[]): Promise<void> {
    if (!this.enabled || values.length === 0) return;
    const key = `${BLOOM_KEY_PREFIX}${namespace}`;
    const client = this.redis.getClientSignedUrlCache();
    const CHUNK = 500;
    for (let i = 0; i < values.length; i += CHUNK) {
      const chunk = values.slice(i, i + CHUNK);
      try {
        const pipeline = client.pipeline();
        for (const v of chunk) {
          for (const bit of bloomBits(v)) {
            pipeline.setbit(key, bit, 1);
          }
        }
        await pipeline.exec();
      } catch (err) {
        this.logger.warn(
          `Bloom rebuild chunk failed ns=${namespace}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
    this.logger.log(
      `Bloom filter rebuilt: ns=${namespace}, ${values.length} items.`,
    );
  }
}
