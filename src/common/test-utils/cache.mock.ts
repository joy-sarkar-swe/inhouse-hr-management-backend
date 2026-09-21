/**
 * @fileoverview Cache layer mock factories for unit tests.
 *
 * Provides reusable jest mocks for `CacheOrchestratorService`,
 * `BloomFilterService`, `L1CacheService`, and `MetricsService`.
 *
 * @module common/test-utils
 */

/**
 * Creates a `CacheOrchestratorService` mock.
 *
 * By default `get()` returns `null` and `invalidate()` / `invalidatePattern()`
 * resolve immediately. Override per test:
 * ```ts
 * mockCache.get.mockResolvedValueOnce(myEntity);
 * ```
 *
 * @returns Jest mock shaped like `CacheOrchestratorService`.
 */
export function createMockCacheOrchestrator() {
  return {
    get: jest.fn().mockResolvedValue(null),
    invalidate: jest.fn().mockResolvedValue(undefined),
    invalidatePattern: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates a `BloomFilterService` mock.
 *
 * By default `mightExist()` returns `true` (fail-open — allows all through).
 * Override per test:
 * ```ts
 * mockBloom.mightExist.mockResolvedValueOnce(false); // simulate Bloom block
 * ```
 *
 * @returns Jest mock shaped like `BloomFilterService`.
 */
export function createMockBloomFilter() {
  return {
    mightExist: jest.fn().mockResolvedValue(true),
    add: jest.fn().mockResolvedValue(undefined),
    rebuild: jest.fn().mockResolvedValue(undefined),
  };
}

/**
 * Creates an `L1CacheService` mock.
 *
 * By default `get()` returns `undefined` (miss) and `set()` / `delete()` are no-ops.
 *
 * @returns Jest mock shaped like `L1CacheService`.
 */
export function createMockL1Cache() {
  return {
    get: jest.fn().mockReturnValue(undefined),
    set: jest.fn(),
    delete: jest.fn(),
    size: jest.fn().mockReturnValue(0),
    clear: jest.fn(),
  };
}

/**
 * Creates a `MetricsService` mock (all methods are no-ops).
 *
 * @returns Jest mock shaped like `MetricsService`.
 */
export function createMockMetricsService() {
  return {
    incCacheL1Hit: jest.fn(),
    incCacheL1Miss: jest.fn(),
    incCacheBloomBlock: jest.fn(),
    incCacheL2Hit: jest.fn(),
    incCacheDbFetch: jest.fn(),
    incCacheInvalidation: jest.fn(),
    incHttpRequest: jest.fn(),
    observeHttpDuration: jest.fn(),
    getMetrics: jest.fn().mockResolvedValue(''),
    getContentType: jest.fn().mockReturnValue('text/plain'),
  };
}
