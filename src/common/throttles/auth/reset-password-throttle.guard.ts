/**
 * @fileoverview Reset-password throttle guard — multi-layer.
 *
 * Layers:
 *  1. IP + UA hash + optional device-id (always applied)
 *  2. Email identity   (legacy — only fires for callers still passing `email` in the body)
 *
 * NOTE: After the token-based forgot-password refactor, `ResetPasswordDto`
 * only carries `{ reset_token, newPassword }`. The email layer below
 * therefore no-ops for current clients — the IP+UA layer is the real gate,
 * and that's enough because tokens are single-use + atomically consumed
 * via Redis GETDEL (replay-safe by construction).
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
import {
  RESET_PASSWORD,
  RESET_PASSWORD_EMAIL,
} from '../config/throttle.config';

@Injectable()
export class ResetPasswordThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const body = (req.body as Record<string, unknown> | undefined) ?? {};

    const layers: ThrottleLayer[] = [
      {
        identifier: buildHybridIpKey(req),
        config: {
          keyPrefix: RESET_PASSWORD.KEY_PREFIX,
          ttlSeconds: RESET_PASSWORD.TTL_SECONDS,
          limit: RESET_PASSWORD.LIMIT,
          blockSeconds: RESET_PASSWORD.BLOCK_SECONDS,
          identifierType: 'ip+ua+device',
        },
      },
    ];

    const email = body['email'];
    if (typeof email === 'string' && email.includes('@')) {
      layers.push({
        identifier: email.toLowerCase().trim(),
        config: {
          keyPrefix: RESET_PASSWORD_EMAIL.KEY_PREFIX,
          ttlSeconds: RESET_PASSWORD_EMAIL.TTL_SECONDS,
          limit: RESET_PASSWORD_EMAIL.LIMIT,
          identifierType: 'email',
        },
      });
    }

    return layers;
  }
}
