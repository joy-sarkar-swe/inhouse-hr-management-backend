/**
 * @fileoverview User profile throttle guards — profile write and avatar upload/delete.
 *
 * @module throttles/profile
 */
import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RedisClientService } from '../../redis/redis.client';
import { BaseThrottleGuard, ThrottleLayer } from '../base-throttle.guard';
import { PROFILE_AVATAR, PROFILE_WRITE } from '../config/throttle.config';

/** Rate-limits profile update per authenticated user. */
@Injectable()
export class ProfileWriteThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const userId = (req as any).user?.id ?? 'anon';
    return [
      {
        identifier: userId,
        config: {
          keyPrefix: PROFILE_WRITE.KEY_PREFIX,
          ttlSeconds: PROFILE_WRITE.TTL_SECONDS,
          limit: PROFILE_WRITE.LIMIT,
          identifierType: 'userId',
        },
      },
    ];
  }
}

/** Rate-limits avatar upload/delete per authenticated user (GCS ops are expensive). */
@Injectable()
export class ProfileAvatarThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const userId = (req as any).user?.id ?? 'anon';
    return [
      {
        identifier: userId,
        config: {
          keyPrefix: PROFILE_AVATAR.KEY_PREFIX,
          ttlSeconds: PROFILE_AVATAR.TTL_SECONDS,
          limit: PROFILE_AVATAR.LIMIT,
          identifierType: 'userId',
        },
      },
    ];
  }
}
