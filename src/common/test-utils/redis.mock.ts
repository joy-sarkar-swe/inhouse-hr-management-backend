/**
 * @fileoverview Redis mock factories for unit tests.
 *
 * Provides reusable jest mock instances for `RedisClientService` and the
 * underlying ioredis client. Tests that need Redis behaviour (LPUSH, RPOP,
 * GET, SETEX, etc.) can configure the mocks individually per test case.
 *
 * @module common/test-utils
 */

/**
 * Creates a minimal ioredis client mock with commonly used commands.
 *
 * @returns Jest mock object shaped like an ioredis `Redis` instance.
 */
export function createMockRedisClient() {
  return {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    setex: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    lpush: jest.fn().mockResolvedValue(1),
    rpop: jest.fn().mockResolvedValue(null),
    pipeline: jest.fn().mockReturnValue({
      setbit: jest.fn().mockReturnThis(),
      getbit: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    }),
    scan: jest.fn().mockResolvedValue(['0', []]),
    quit: jest.fn().mockResolvedValue('OK'),
  };
}

/**
 * Creates a `RedisClientService` mock whose named getter methods all return
 * the same underlying mock ioredis client by default.
 *
 * Override individual methods as needed per test:
 * ```ts
 * mockRedis.getClientSignedUrlCache().get.mockResolvedValueOnce('cached');
 * ```
 *
 * @returns Jest mock object shaped like `RedisClientService`.
 */
export function createMockRedisClientService() {
  const client = createMockRedisClient();
  return {
    getClientAuth: jest.fn().mockReturnValue(client),
    getClientThrottle: jest.fn().mockReturnValue(client),
    getClientSignedUrlCache: jest.fn().mockReturnValue(client),
    getClientEmailQueueOptions: jest.fn().mockReturnValue({}),
    getClientAuthEmailQueueOptions: jest.fn().mockReturnValue({}),
    _client: client, // expose the underlying client for assertions
  };
}
