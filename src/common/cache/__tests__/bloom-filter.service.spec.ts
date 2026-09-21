/**
 * @fileoverview Unit tests for BloomFilterService.
 *
 * Verifies:
 *  - add() pipelines SETBIT commands to Redis
 *  - mightExist() returns true when all bits are set, false when any bit is 0
 *  - mightExist() fails open (returns true) on Redis error
 *  - rebuild() paginates in chunks of 500
 *  - All methods no-op when `enabled` is false
 *
 * @module common/cache/__tests__
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BloomFilterService } from '../bloom-filter.service';
import { RedisClientService } from '../../redis/redis.client';
import { createMockRedisClientService } from '../../test-utils/redis.mock';

describe('BloomFilterService', () => {
  let service: BloomFilterService;
  let redisService: ReturnType<typeof createMockRedisClientService>;
  let mockPipeline: { setbit: jest.Mock; getbit: jest.Mock; exec: jest.Mock };

  beforeEach(async () => {
    redisService = createMockRedisClientService();
    mockPipeline = {
      setbit: jest.fn().mockReturnThis(),
      getbit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    redisService._client.pipeline = jest.fn().mockReturnValue(mockPipeline);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BloomFilterService,
        { provide: RedisClientService, useValue: redisService },
      ],
    }).compile();

    service = module.get(BloomFilterService);
    // Force-enable the filter regardless of env var so tests are deterministic
    (service as any).enabled = true;
  });

  // ── add() ──────────────────────────────────────────────────────────────────

  it('add() calls SETBIT pipeline for each hash position', async () => {
    await service.add('shop', 'abc123');

    expect(redisService._client.pipeline).toHaveBeenCalled();
    expect(mockPipeline.setbit).toHaveBeenCalled();
    expect(mockPipeline.exec).toHaveBeenCalled();
    const calls = mockPipeline.setbit.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    calls.forEach(([key, , value]: [string, number, number]) => {
      expect(key).toBe('bloom:shop');
      expect(value).toBe(1);
    });
  });

  it('add() swallows Redis pipeline errors (fail-open)', async () => {
    mockPipeline.exec.mockRejectedValue(new Error('Redis error'));
    await expect(service.add('shop', 'abc123')).resolves.toBeUndefined();
  });

  // ── mightExist() ───────────────────────────────────────────────────────────

  it('mightExist() returns true when all bits are set (1)', async () => {
    mockPipeline.exec.mockResolvedValue(
      Array.from({ length: 10 }, () => [null, 1]),
    );
    const result = await service.mightExist('shop', 'present');
    expect(result).toBe(true);
  });

  it('mightExist() returns false when any bit is 0', async () => {
    const results: [null, number][] = Array.from({ length: 10 }, () => [
      null,
      1,
    ]);
    results[3] = [null, 0];
    mockPipeline.exec.mockResolvedValue(results);
    const result = await service.mightExist('shop', 'absent');
    expect(result).toBe(false);
  });

  it('mightExist() returns true on Redis pipeline error (fail-open)', async () => {
    redisService._client.pipeline = jest.fn().mockImplementation(() => {
      throw new Error('Redis down');
    });
    const result = await service.mightExist('shop', 'anything');
    expect(result).toBe(true);
  });

  it('mightExist() returns true when exec returns null (fail-open)', async () => {
    mockPipeline.exec.mockResolvedValue(null);
    const result = await service.mightExist('shop', 'anything');
    expect(result).toBe(true);
  });

  // ── rebuild() ─────────────────────────────────────────────────────────────

  it('rebuild() with empty values array does nothing', async () => {
    await service.rebuild('shop', []);
    expect(redisService._client.pipeline).not.toHaveBeenCalled();
  });

  it('rebuild() processes values in chunks of 500', async () => {
    const ids = Array.from({ length: 1200 }, (_, i) => `id-${i}`);
    await service.rebuild('shop', ids);
    // 1200 / 500 = 3 chunks → 3 pipeline calls
    expect(redisService._client.pipeline).toHaveBeenCalledTimes(3);
    expect(mockPipeline.exec).toHaveBeenCalledTimes(3);
  });

  // ── disabled mode ──────────────────────────────────────────────────────────

  it('mightExist() returns true without Redis when disabled', async () => {
    (service as any).enabled = false;
    const result = await service.mightExist('shop', 'any');
    expect(result).toBe(true);
    expect(redisService._client.pipeline).not.toHaveBeenCalled();
  });

  it('add() is a no-op without Redis when disabled', async () => {
    (service as any).enabled = false;
    await service.add('shop', 'any');
    expect(redisService._client.pipeline).not.toHaveBeenCalled();
  });
});
