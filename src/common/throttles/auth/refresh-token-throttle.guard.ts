/**
 * @fileoverview Refresh-token throttle guard — IP-scoped.
 *
 * Prevents high-frequency refresh token requests from a single client,
 * which could indicate token spray or brute-force attempts.
 *
 * Layer enforced:
 *  1. IP + UA hash + optional device-id
 *
 * @module throttles/auth
 */
import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RedisClientService } from '../../redis/redis.client';
import {
  BaseThrottleGuard,
  buildHybridIpKey,
  ThrottleLayer,
} from '../base-throttle.guard';
import { REFRESH_TOKEN } from '../config/throttle.config';

@Injectable()
export class RefreshTokenThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    return [
      {
        identifier: buildHybridIpKey(req),
        config: {
          keyPrefix: REFRESH_TOKEN.KEY_PREFIX,
          ttlSeconds: REFRESH_TOKEN.TTL_SECONDS,
          limit: REFRESH_TOKEN.LIMIT,
          blockSeconds: REFRESH_TOKEN.BLOCK_SECONDS,
          identifierType: 'ip+ua+device',
        },
      },
    ];
  }
}
