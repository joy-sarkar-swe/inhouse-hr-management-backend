/**
 * @fileoverview Authenticated-user throttle guard.
 *
 * Enforces a per-userId rate limit on all protected (JWT-authenticated)
 * endpoints to prevent abuse via IP rotation after login.
 *
 * This guard must be placed AFTER JwtAuthGuard in the guard chain so that
 * request.user is already resolved.
 *
 * Layer:
 *  1. Authenticated userId (primary and only identifier — IP rotation proof)
 *
 * Falls back to IP+UA when userId is not present (should not happen in
 * normal operation; treated as an unexpected state and logged as warn).
 *
 * @module throttles/user
 */
import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RedisClientService } from '../../redis/redis.client';
import {
  BaseThrottleGuard,
  buildHybridIpKey,
  ThrottleLayer,
} from '../base-throttle.guard';
import { AUTHENTICATED_USER } from '../config/throttle.config';

@Injectable()
export class AuthenticatedUserThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const userId = (req as any).user?.id ?? 'anon';

    if (userId) {
      return [
        {
          identifier: userId,
          config: {
            keyPrefix: AUTHENTICATED_USER.KEY_PREFIX,
            ttlSeconds: AUTHENTICATED_USER.TTL_SECONDS,
            limit: AUTHENTICATED_USER.LIMIT,
            identifierType: 'userId',
          },
        },
      ];
    }

    // Unexpected fallback — JwtAuthGuard should always run first
    this.logger.warn({
      msg: 'AUTH_USER_THROTTLE_NO_USERID',
      note: 'Falling back to IP+UA — JwtAuthGuard may not have run before this guard',
    });

    return [
      {
        identifier: buildHybridIpKey(req),
        config: {
          keyPrefix: AUTHENTICATED_USER.KEY_PREFIX,
          ttlSeconds: AUTHENTICATED_USER.TTL_SECONDS,
          limit: AUTHENTICATED_USER.LIMIT,
          identifierType: 'ip+ua+device',
        },
      },
    ];
  }
}
