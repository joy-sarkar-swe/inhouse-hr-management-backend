/**
 * @fileoverview Change-email throttle guard — user-scoped (authenticated).
 *
 * Limits how often a logged-in user can initiate an email change, preventing
 * OTP spam to arbitrary email addresses.
 *
 * Layer enforced:
 *  1. Authenticated userId (primary — IP-rotation proof)
 *  2. IP + UA hash + optional device-id (secondary — defence-in-depth)
 *
 * JwtAuthGuard must run before this guard so request.user is available.
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
import { CHANGE_EMAIL } from '../config/throttle.config';

@Injectable()
export class ChangeEmailThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const userId = (req as any).user?.id ?? 'anon';
    const layers: ThrottleLayer[] = [];

    if (userId) {
      layers.push({
        identifier: userId,
        config: {
          keyPrefix: CHANGE_EMAIL.KEY_PREFIX,
          ttlSeconds: CHANGE_EMAIL.TTL_SECONDS,
          limit: CHANGE_EMAIL.LIMIT,
          identifierType: 'userId',
        },
      });
    }

    layers.push({
      identifier: buildHybridIpKey(req),
      config: {
        keyPrefix: `${CHANGE_EMAIL.KEY_PREFIX}:ip`,
        ttlSeconds: CHANGE_EMAIL.TTL_SECONDS,
        limit: CHANGE_EMAIL.LIMIT,
        identifierType: 'ip+ua+device',
      },
    });

    return layers;
  }
}
