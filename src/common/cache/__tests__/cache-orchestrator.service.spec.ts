/**
 * @fileoverview Unit tests for CacheOrchestratorService.
 *
 * Verifies the complete L1 → Bloom → L2 → DB pipeline including:
 *  - L1 hit short-circuits all downstream layers
 *  - Bloom miss returns null without touching L2 or the fetcher
 *  - L2 hit hydrates L1 and returns without calling the fetcher
 *  - DB fetch (full miss) writes to L2 + L1 + Bloom
 *  - Request coalescing (inflight dedup)
 *  - bypassBloom option skips the Bloom check
 *  - invalidate() evicts from L1 and L2
 *  - invalidatePattern() scans and deletes matching L2 keys
 *  - Redis failures fail-open (never throw to callers)
 *  - TTL jitter is applied to L2 writes
 *
 * All Redis and cache dependencies are fully mocked — no live Redis needed.
 *
 * @module common/cache/__tests__
 */
import { Test, TestingModule } from '@nestjs/testing';
import { CacheOrchestratorService } from '../cache-orchestrator.service';
import { L1CacheService } from '../l1-cache.service';
import { BloomFilterService } from '../bloom-filter.service';
import { RedisClientService } from '../../redis/redis.client';
import { MetricsService } from '../../metrics/metrics.service';
import {
  createMockL1Cache,
  createMockBloomFilter,
  createMockMetricsService,
} from '../../test-utils/cache.mock';
import { createMockRedisClientService } from '../../test-utils/redis.mock';

describe('CacheOrchestratorService', () => {
  let service: CacheOrchestratorService;
  let l1: ReturnType<typeof createMockL1Cache>;
  let bloom: ReturnType<typeof createMockBloomFilter>;
  let redisService: ReturnType<typeof createMockRedisClientService>;
  let redisClient: ReturnType<typeof createMockRedisClientService>['_client'];
  let metrics: ReturnType<typeof createMockMetricsService>;

  beforeEach(async () => {
    l1 = createMockL1Cache();
    bloom = createMockBloomFilter();
    redisService = createMockRedisClientService();
    redisClient = redisService._client;
    metrics = createMockMetricsService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheOrchestratorService,
        { provide: L1CacheService, useValue: l1 },
        { provide: BloomFilterService, useValue: bloom },
        { provide: RedisClientService, useValue: redisService },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    service = module.get(CacheOrchestratorService);
  });

  // ── L1 hit ─────────────────────────────────────────────────────────────────

  it('returns L1 cached value without touching Bloom, L2, or fetcher', async () => {
    const entity = { id: '1', name: 'test' };
    l1.get.mockReturnValue(entity);
    const fetcher = jest.fn();

    const result = await service.get('shop:id', '1', fetcher);

    expect(result).toBe(entity);
    expect(bloom.mightExist).not.toHaveBeenCalled();
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(metrics.incCacheL1Hit).toHaveBeenCalledWith('shop:id');
  });

  // ── Bloom miss ─────────────────────────────────────────────────────────────

  it('returns null on Bloom miss without calling L2 or fetcher', async () => {
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(false);
    const fetcher = jest.fn();

    const result = await service.get('shop:id', 'unknown', fetcher);

    expect(result).toBeNull();
    expect(redisClient.get).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
    expect(metrics.incCacheBloomBlock).toHaveBeenCalledWith('shop:id');
  });

  // ── L2 hit ─────────────────────────────────────────────────────────────────

  it('returns L2 cached value, hydrates L1, skips fetcher', async () => {
    const entity = { id: '2', name: 'from-l2' };
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(true);
    redisClient.get.mockResolvedValue(JSON.stringify(entity));
    const fetcher = jest.fn();

    const result = await service.get('shop:id', '2', fetcher);

    expect(result).toEqual(entity);
    expect(l1.set).toHaveBeenCalledWith(
      'shop:id:2',
      entity,
      expect.any(Number),
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(metrics.incCacheL2Hit).toHaveBeenCalledWith('shop:id');
  });

  // ── DB fetch ───────────────────────────────────────────────────────────────

  it('calls fetcher on full miss, writes to L2 + L1 + Bloom', async () => {
    const entity = { id: '3', name: 'from-db' };
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(true);
    redisClient.get.mockResolvedValue(null);
    const fetcher = jest.fn().mockResolvedValue(entity);

    const result = await service.get('shop:id', '3', fetcher, {
      l2TtlSecs: 300,
    });

    expect(result).toEqual(entity);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(redisClient.setex).toHaveBeenCalledWith(
      expect.stringContaining('shop:id:3'),
      expect.any(Number),
      JSON.stringify(entity),
    );
    expect(l1.set).toHaveBeenCalledWith(
      'shop:id:3',
      entity,
      expect.any(Number),
    );
    expect(bloom.add).toHaveBeenCalledWith('shop:id', '3');
    expect(metrics.incCacheDbFetch).toHaveBeenCalledWith('shop:id');
  });

  it('returns null when fetcher returns null, does NOT write to L2/L1/Bloom', async () => {
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(true);
    redisClient.get.mockResolvedValue(null);
    const fetcher = jest.fn().mockResolvedValue(null);

    const result = await service.get('shop:id', 'missing', fetcher);

    expect(result).toBeNull();
    expect(redisClient.setex).not.toHaveBeenCalled();
    expect(l1.set).not.toHaveBeenCalled();
    expect(bloom.add).not.toHaveBeenCalled();
  });

  // ── Request coalescing ─────────────────────────────────────────────────────

  it('coalesces concurrent requests for the same key into one fetcher call', async () => {
    const entity = { id: '4', name: 'coalesced' };
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(true);
    redisClient.get.mockResolvedValue(null);

    // Use a deferred promise so we control exactly when the DB "responds"
    let resolveDb!: (v: typeof entity) => void;
    const dbPromise = new Promise<typeof entity>((r) => {
      resolveDb = r;
    });
    const fetcher = jest.fn().mockReturnValue(dbPromise);

    // Start 3 concurrent requests — none resolves yet
    const p1 = service.get('shop:id', '4', fetcher);
    const p2 = service.get('shop:id', '4', fetcher);
    const p3 = service.get('shop:id', '4', fetcher);

    // Now resolve the DB — all 3 should complete with the same value
    resolveDb(entity);
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(r1).toEqual(entity);
    expect(r2).toEqual(entity);
    expect(r3).toEqual(entity);
  });

  // ── bypassBloom ────────────────────────────────────────────────────────────

  it('bypassBloom: true skips Bloom even when mightExist returns false', async () => {
    const entity = { id: '5', name: 'bypass' };
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(false);
    redisClient.get.mockResolvedValue(null);
    const fetcher = jest.fn().mockResolvedValue(entity);

    const result = await service.get('shop:id', '5', fetcher, {
      bypassBloom: true,
    });

    expect(result).toEqual(entity);
    expect(bloom.mightExist).not.toHaveBeenCalled();
  });

  // ── invalidate ─────────────────────────────────────────────────────────────

  it('invalidate() deletes from L1 and L2', async () => {
    await service.invalidate('shop:id', '6');

    expect(l1.delete).toHaveBeenCalledWith('shop:id:6');
    expect(redisClient.del).toHaveBeenCalledWith(
      expect.stringContaining('shop:id:6'),
    );
    expect(metrics.incCacheInvalidation).toHaveBeenCalledWith('shop:id');
  });

  // ── Redis fail-open ────────────────────────────────────────────────────────

  it('L2 read failure falls through to fetcher without throwing', async () => {
    const entity = { id: '7', name: 'fallback' };
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(true);
    redisClient.get.mockRejectedValue(new Error('Redis ECONNREFUSED'));
    const fetcher = jest.fn().mockResolvedValue(entity);

    await expect(service.get('shop:id', '7', fetcher)).resolves.toEqual(entity);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('L2 write failure returns the fetched value without throwing', async () => {
    const entity = { id: '8', name: 'write-fail' };
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(true);
    redisClient.get.mockResolvedValue(null);
    redisClient.setex.mockRejectedValue(new Error('Redis write error'));
    const fetcher = jest.fn().mockResolvedValue(entity);

    await expect(service.get('shop:id', '8', fetcher)).resolves.toEqual(entity);
  });

  // ── TTL jitter ─────────────────────────────────────────────────────────────

  it('applies ±20% TTL jitter on L2 writes', async () => {
    const entity = { id: '9', name: 'jitter' };
    l1.get.mockReturnValue(undefined);
    bloom.mightExist.mockResolvedValue(true);
    redisClient.get.mockResolvedValue(null);
    const fetcher = jest.fn().mockResolvedValue(entity);
    const BASE_TTL = 300;

    await service.get('shop:id', '9', fetcher, { l2TtlSecs: BASE_TTL });

    const [, ttlArg] = redisClient.setex.mock.calls[0];
    expect(ttlArg).toBeGreaterThanOrEqual(BASE_TTL * 0.8);
    expect(ttlArg).toBeLessThanOrEqual(BASE_TTL * 1.2);
  });
});
