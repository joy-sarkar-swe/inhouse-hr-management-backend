/**
 * @fileoverview SignedUrlCacheService — Redis-backed read-through cache for
 * GCS V4 signed URLs.
 *
 * ── Why ───────────────────────────────────────────────────────────────────────
 *
 * Public product / shop / order listings sign every image URL on every request
 * (15-min TTL). Without caching this turns into thousands of GCS sign calls per
 * minute on a busy listing page. GCS sign is cheap but not free, has its own
 * QPS limits, and adds latency.
 *
 * The cache stores each `{bucket}/{path}` → signed URL with a TTL slightly
 * shorter than the URL's own TTL so a hit is always usable by the client. On
 * miss, the loader function (typically `GcpStorageService.getSignedUrl()`)
 * runs once even under a burst — concurrent callers share the in-flight
 * promise (single-flight) to prevent thundering-herd stampedes.
 *
 * Failure mode: if Redis is down, this layer logs and falls through to the
 * loader. Signed URLs are still correct; we just lose the cache hit.
 *
 * ── Key format ───────────────────────────────────────────────────────────────
 *
 *   signed-url:v1:{bucket}:{storagePath}
 *
 * Bump `v1` if the cached value shape ever changes (e.g. you switch to
 * SHA-512 signing or migrate to a new bucket layout).
 *
 * @module common/gcp-storage
 */
import { Injectable, Logger } from '@nestjs/common';
import type Redis from 'ioredis';
import { RedisClientService } from 'src/common/redis/redis.client';

/**
 * How much earlier than the URL's own TTL we expire the cache entry. Prevents
 * handing out a URL that's about to expire client-side.
 */
const CACHE_TTL_SAFETY_MARGIN_S = 60;

const KEY_PREFIX = 'signed-url:v1:';

@Injectable()
export class SignedUrlCacheService {
  private readonly logger = new Logger(SignedUrlCacheService.name);
  private readonly redis: Redis;

  /**
   * In-flight loader map. Multiple concurrent requests for the same key share
   * the same promise so the underlying loader only runs once per cache miss.
   * Keys are evicted as soon as the promise settles.
   */
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(redisClientService: RedisClientService) {
    this.redis = redisClientService.getClientSignedUrlCache();
  }

  private buildKey(bucket: string, storagePath: string): string {
    return `${KEY_PREFIX}${bucket}:${storagePath}`;
  }

  /**
   * Read a cached signed URL or compute + cache a fresh one.
   *
   * @param key        Logical cache key — typically `bucket:storagePath`.
   * @param ttlSeconds The URL's own TTL. The cache entry expires
   *                   `CACHE_TTL_SAFETY_MARGIN_S` seconds earlier.
   * @param loader     Function that produces a fresh signed URL on miss.
   *                   Called at most once per concurrent cache miss.
   */
  async getOrSet(
    bucket: string,
    storagePath: string,
    ttlSeconds: number,
    loader: () => Promise<string>,
  ): Promise<string> {
    const key = this.buildKey(bucket, storagePath);
    const cacheTtl = Math.max(1, ttlSeconds - CACHE_TTL_SAFETY_MARGIN_S);

    // 1. Try cache hit
    try {
      const hit = await this.redis.get(key);
      if (hit) return hit;
    } catch (err) {
      this.logger.warn(
        `Redis GET failed for ${key} (falling through to loader): ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // 2. Single-flight: piggy-back on an in-flight loader for the same key
    const existing = this.inflight.get(key);
    if (existing) return existing;

    // 3. Run the loader and cache the result
    const promise = (async () => {
      try {
        const url = await loader();
        try {
          await this.redis.set(key, url, 'EX', cacheTtl);
        } catch (err) {
          this.logger.warn(
            `Redis SET failed for ${key} (returning URL without caching): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        return url;
      } finally {
        this.inflight.delete(key);
      }
    })();

    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Invalidate a single cached entry. Call this when an object is deleted or
   * its storage path changes — otherwise public listings could keep returning
   * a URL that points at gone bytes.
   */
  async invalidate(bucket: string, storagePath: string): Promise<void> {
    const key = this.buildKey(bucket, storagePath);
    try {
      await this.redis.del(key);
    } catch (err) {
      this.logger.warn(
        `Redis DEL failed for ${key}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /** Batch invalidate. Same caveats as {@link invalidate}. */
  async invalidateMany(
    items: Array<{ bucket: string; storagePath: string }>,
  ): Promise<void> {
    if (!items.length) return;
    const keys = items.map((i) => this.buildKey(i.bucket, i.storagePath));
    try {
      await this.redis.del(...keys);
    } catch (err) {
      this.logger.warn(
        `Redis batch DEL failed (${items.length} keys): ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
