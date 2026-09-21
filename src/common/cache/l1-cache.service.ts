/**
 * @fileoverview L1 bounded in-process LRU cache with per-entry TTL.
 *
 * Implementation: a `Map` maintains insertion order. On every `set`, if the
 * map is at capacity the oldest entry (first key in iteration order) is
 * evicted before inserting the new one — O(1) amortised due to Map behaviour.
 *
 * TTL is checked lazily on `get`; expired entries are deleted and treated as
 * a miss. There is no background sweeper — entries only vanish when read or
 * when evicted by overflow.
 *
 * @module common/cache
 */
import { Injectable } from '@nestjs/common';
import { L1_MAX_SIZE, L1_TTL_MS, TTL_JITTER_FACTOR } from './cache.constants';

interface L1Entry<T> {
  /** The cached payload. */
  value: T;
  /** Unix timestamp (ms) after which this entry is considered expired. */
  expiresAt: number;
}

@Injectable()
export class L1CacheService {
  private readonly store = new Map<string, L1Entry<unknown>>();

  /**
   * Retrieve a cached value, evicting it first if expired.
   *
   * Refreshes the entry's LRU position on a cache hit by deleting and
   * re-inserting it so it moves to the end of the Map's iteration order.
   *
   * @param key - Composite cache key (`namespace:id`).
   * @returns Cached value, or `undefined` on a miss or expiry.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key) as L1Entry<T> | undefined;
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    // Move to end (LRU refresh) — delete + re-insert
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  /**
   * Insert or overwrite a value in the L1 cache with a ±20 % jittered TTL.
   *
   * If the store is at `L1_MAX_SIZE`, the oldest (first) entry is evicted
   * before inserting, keeping memory bounded.
   *
   * @param key   - Composite cache key.
   * @param value - Value to store.
   * @param ttlMs - Base TTL in milliseconds (defaults to `L1_TTL_MS`).
   */
  set<T>(key: string, value: T, ttlMs = L1_TTL_MS): void {
    if (this.store.size >= L1_MAX_SIZE) {
      // Evict oldest entry
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    const jitter = 1 + (Math.random() * 2 - 1) * TTL_JITTER_FACTOR;
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs * jitter });
  }

  /**
   * Remove a single entry from the L1 store.
   *
   * @param key - Composite cache key to evict.
   */
  delete(key: string): void {
    this.store.delete(key);
  }

  /** Flush all L1 entries — used in tests and forced-refresh scenarios. */
  clear(): void {
    this.store.clear();
  }
}
