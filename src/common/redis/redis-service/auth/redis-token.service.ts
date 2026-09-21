/**
 * @fileoverview Redis token service.
 *
 * Manages JWT authentication tokens in Redis — store, retrieve, delete, and
 * bulk-invalidate.
 *
 * Key layout (all in REDIS_DB_AUTH):
 *  - Access token:  `{userId}:{sessionId}`         → short-lived JWT
 *  - Refresh token: `refresh:{userId}:{sessionId}` → long-lived JWT
 *
 * The shared `sessionId` ties an access/refresh pair together so that logout
 * can atomically delete both without a secondary index.
 */
import { Injectable, Logger } from '@nestjs/common';
import { RedisClientService } from '../../redis.client';

@Injectable()
export class RedisTokenService {
  private readonly logger = new Logger(RedisTokenService.name);

  constructor(private readonly redisClient: RedisClientService) {}

  /**
   * Store a token (access or refresh) in Redis with a TTL.
   * @param tokenId  - Unique Redis key (access: `userId:sessionId`, refresh: `refresh:userId:sessionId`).
   * @param token    - Signed JWT string.
   * @param ttlSeconds - Expiry in seconds.
   */
  async storeToken(
    tokenId: string,
    token: string,
    ttlSeconds: number,
  ): Promise<void> {
    this.logger.debug(`Storing token key=${tokenId} ttl=${ttlSeconds}s`);
    await this.redisClient
      .getClientAuth()
      .set(tokenId, token, 'EX', ttlSeconds);
  }

  /**
   * Retrieve a token from Redis.
   * @param tokenId - Redis key.
   * @returns The stored JWT string, or `null` if not found / expired.
   */
  async getToken(tokenId: string): Promise<string | null> {
    this.logger.debug(`Retrieving token key=${tokenId}`);
    return this.redisClient.getClientAuth().get(tokenId);
  }

  /**
   * Delete a single token from Redis.
   * @param tokenId - Redis key to delete.
   */
  async deleteToken(tokenId: string): Promise<void> {
    this.logger.debug(`Deleting token key=${tokenId}`);
    await this.redisClient.getClientAuth().del(tokenId);
  }

  /**
   * Delete both the access token and its paired refresh token in a single
   * Redis call.
   *
   * @param accessKey  - Access token key (`userId:sessionId`).
   * @param refreshKey - Refresh token key (`refresh:userId:sessionId`).
   */
  async deleteTokenPair(accessKey: string, refreshKey: string): Promise<void> {
    this.logger.debug(
      `Deleting token pair access=${accessKey} refresh=${refreshKey}`,
    );
    await this.redisClient.getClientAuth().del(accessKey, refreshKey);
  }

  /**
   * Delete ALL access and refresh tokens for a given user (logout-all / revoke-all).
   *
   * Uses cursor-based SCAN to avoid blocking Redis on large key-spaces.
   *
   * @param userId - UUID of the user whose tokens should be invalidated.
   * @returns Total number of keys deleted.
   */
  async deleteAllUserTokens(userId: string): Promise<number> {
    this.logger.debug(`Deleting all tokens for userId=${userId}`);
    const client = this.redisClient.getClientAuth();

    const patterns = [`${userId}:*`, `refresh:${userId}:*`];
    let totalDeleted = 0;

    for (const pattern of patterns) {
      let cursor = 0;
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = Number(nextCursor);
        if (keys.length > 0) {
          await client.del(...keys);
          totalDeleted += keys.length;
        }
      } while (cursor !== 0);
    }

    this.logger.debug(`Deleted ${totalDeleted} token(s) for userId=${userId}`);
    return totalDeleted;
  }
}
