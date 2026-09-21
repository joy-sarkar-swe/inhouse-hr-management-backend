/**
 * @fileoverview Change-password throttle guard — user-scoped.
 *
 * This guard operates on authenticated endpoints.
 *
 * Layers enforced (in order):
 *  1. Authenticated userId (primary — prevents IP-rotation bypass entirely)
 *  2. IP + UA hash + optional device-id (secondary — defence-in-depth)
 *
 * Using userId as the primary identifier means an attacker with 1000 IPs
 * is still limited by their account — the most important boundary.
 *
 * The userId is resolved from request.user (set by JwtAuthGuard which must
 * run before this guard). Falls back to IP-only when not authenticated
 * (should not occur in practice given guard ordering).
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
import { CHANGE_PASSWORD } from '../config/throttle.config';

@Injectable()
export class ChangePasswordThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    // JwtAuthGuard attaches user to request before this guard runs
    const userId = (req as any).user?.id ?? 'anon';

    const layers: ThrottleLayer[] = [];

    if (userId) {
      // Primary: user-scoped — unaffected by IP rotation
      layers.push({
        identifier: userId,
        config: {
          keyPrefix: CHANGE_PASSWORD.KEY_PREFIX,
          ttlSeconds: CHANGE_PASSWORD.TTL_SECONDS,
          limit: CHANGE_PASSWORD.LIMIT,
          identifierType: 'userId',
        },
      });
    }

    // Secondary: IP+UA — defence-in-depth even without userId
    layers.push({
      identifier: buildHybridIpKey(req),
      config: {
        keyPrefix: `${CHANGE_PASSWORD.KEY_PREFIX}:ip`,
        ttlSeconds: CHANGE_PASSWORD.TTL_SECONDS,
        limit: CHANGE_PASSWORD.LIMIT,
        identifierType: 'ip+ua+device',
      },
    });

    return layers;
  }
}
