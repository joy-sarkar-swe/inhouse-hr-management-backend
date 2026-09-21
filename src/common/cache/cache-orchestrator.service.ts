/**
 * @fileoverview Cache orchestrator — L1 → Bloom → L2 → fetcher with request coalescing.
 *
 * Flow for `get(namespace, id, fetcher)`:
 *  1. L1 hit        → return immediately (zero network)
 *  2. Bloom miss    → return null (saves DB hit for known-absent keys)
 *  3. Inflight hit  → attach to existing Promise (coalescing)
 *  4. L2 Redis hit  → hydrate L1, return
 *  5. DB fetch      → store L2 (TTL jitter), hydrate L1, bloom add, return
 *
 * L2 key format: `l2:<CACHE_VERSION>:<namespace>:<id>` (e.g. `l2:v1:order:id:<uuid>`).
 * Bump `CACHE_VERSION` in `.env` on deploy after Prisma model changes to cold-start
 * the L2 cache without a Redis FLUSHDB — old versioned keys expire via their TTLs.
 *
 * All failure modes fail-open: if Redis is unavailable the fetcher is called
 * directly and L1/Bloom updates are skipped.
 *
 * @module common/cache
 */
import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  L2_DEFAULT_TTL_SECS,
  L2_KEY_PREFIX,
  L1_TTL_MS,
  TTL_JITTER_FACTOR,
} from './cache.constants';
import { BloomFilterService } from './bloom-filter.service';
import { L1CacheService } from './l1-cache.service';
import { RedisClientService } from '../redis/redis.client';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class CacheOrchestratorService {
  private readonly logger = new Logger(CacheOrchestratorService.name);
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly l1: L1CacheService,
    private readonly bloom: BloomFilterService,
    private readonly redis: RedisClientService,
    @Optional() private readonly metrics?: MetricsService,
  ) {}

  /**
   * Retrieve a value from the L1 → Bloom → L2 → DB pipeline.
   *
   * @param namespace    - Logical cache namespace (e.g. `'shop:id'`, `'user:id'`).
   * @param id           - Entity identifier within the namespace.
   * @param fetcher      - Async function that loads the value from the DB when
   *                       cache tiers miss.
   * @param opts.l2TtlSecs  - L2 Redis TTL in seconds (default: `L2_DEFAULT_TTL_SECS`).
   * @param opts.bypassBloom - When `true`, skip the Bloom check (use for new IDs
   *                           not yet populated, or user-scoped keys).
   * @returns Cached or freshly-fetched value, or `null` if absent everywhere.
   */
  async get<T>(
    namespace: string,
    id: string,
    fetcher: () => Promise<T | null>,
    opts?: { l2TtlSecs?: number; bypassBloom?: boolean },
  ): Promise<T | null> {
    const cacheKey = `${namespace}:${id}`;
    const l2Key = `${L2_KEY_PREFIX}${cacheKey}`;
    const l2Ttl = opts?.l2TtlSecs ?? L2_DEFAULT_TTL_SECS;

    // 1. L1 hit
    const l1Hit = this.l1.get<T>(cacheKey);
    if (l1Hit !== undefined) {
      this.metrics?.incCacheL1Hit(namespace);
      return l1Hit;
    }
    this.metrics?.incCacheL1Miss(namespace);

    // 2. Bloom filter — skip for new IDs not yet added
    if (!opts?.bypassBloom) {
      const exists = await this.bloom.mightExist(namespace, id);
      if (!exists) {
        this.metrics?.incCacheBloomBlock(namespace);
        return null;
      }
    }

    // 3. Request coalescing
    if (this.inflight.has(cacheKey)) {
      return this.inflight.get(cacheKey) as Promise<T | null>;
    }

    const work = this._resolve(cacheKey, l2Key, l2Ttl, namespace, id, fetcher);
    this.inflight.set(cacheKey, work);
    try {
      return await work;
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  /**
   * Internal: check L2 then fetch from DB, populate both cache tiers.
   *
   * Called by `get()` after L1 miss and request-coalescing dedup. Not intended
   * for direct use — always go through `get()`.
   *
   * @param cacheKey  - Composite key `namespace:id` used for L1 and inflight map.
   * @param l2Key     - Prefixed Redis key for L2 storage.
   * @param l2Ttl     - Base L2 TTL before jitter is applied.
   * @param namespace - Bloom namespace for the `add()` call after a DB fetch.
   * @param id        - Entity ID for the Bloom `add()` call.
   * @param fetcher   - DB loader.
   * @returns Value or `null`.
   */
  private async _resolve<T>(
    cacheKey: string,
    l2Key: string,
    l2Ttl: number,
    namespace: string,
    id: string,
    fetcher: () => Promise<T | null>,
  ): Promise<T | null> {
    // 4. L2 Redis hit
    try {
      const client = this.redis.getClientSignedUrlCache();
      const raw = await client.get(l2Key);
      if (raw !== null) {
        const value = JSON.parse(raw) as T;
        this.l1.set(cacheKey, value, L1_TTL_MS);
        this.metrics?.incCacheL2Hit(namespace);
        return value;
      }
    } catch (err) {
      this.logger.warn(
        `L2 read failed for ${l2Key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 5. Fetcher → populate L2 + L1 + Bloom
    this.metrics?.incCacheDbFetch(namespace);
    const value = await fetcher();
    if (value !== null && value !== undefined) {
      const jitter = 1 + (Math.random() * 2 - 1) * TTL_JITTER_FACTOR;
      const ttl = Math.round(l2Ttl * jitter);
      try {
        const client = this.redis.getClientSignedUrlCache();
        await client.setex(l2Key, ttl, JSON.stringify(value));
      } catch (err) {
        this.logger.warn(
          `L2 write failed for ${l2Key}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      this.l1.set(cacheKey, value, L1_TTL_MS);
      await this.bloom.add(namespace, id);
    }
    return value ?? null;
  }

  /**
   * Evict a single entity from L1 and L2.
   *
   * Call after a write/delete so subsequent reads re-fetch from DB.
   * Bloom filter is NOT cleared (entries are append-only; a false-positive on
   * a deleted entity simply causes one extra DB read returning null).
   *
   * @param namespace - Cache namespace.
   * @param id        - Entity ID to evict.
   */
  async invalidate(namespace: string, id: string): Promise<void> {
    const cacheKey = `${namespace}:${id}`;
    const l2Key = `${L2_KEY_PREFIX}${cacheKey}`;
    this.l1.delete(cacheKey);
    this.metrics?.incCacheInvalidation(namespace);
    try {
      await this.redis.getClientSignedUrlCache().del(l2Key);
    } catch (err) {
      this.logger.warn(
        `L2 invalidate failed for ${l2Key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Evict all L2 keys matching `l2:<namespace>:*` via SCAN + DEL.
   *
   * Used to flush an entire namespace (e.g. after a bulk import). L1 entries
   * will expire naturally within their TTL window — a stale L1 hit is
   * acceptable for the brief period between pattern-invalidation and expiry.
   *
   * @param namespace - Namespace prefix to match (e.g. `'shop:id'`).
   */
  async invalidatePattern(namespace: string): Promise<void> {
    const pattern = `${L2_KEY_PREFIX}${namespace}:*`;
    try {
      const client = this.redis.getClientSignedUrlCache();
      let cursor = '0';
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;
        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (err) {
      this.logger.warn(
        `L2 invalidatePattern failed for ${pattern}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
