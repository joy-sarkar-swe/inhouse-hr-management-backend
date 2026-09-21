/**
 * @fileoverview Forgot-password throttle guard — multi-layer.
 *
 * Layers enforced (in order):
 *  1. IP + UA hash + optional device-id   (per-client, anti-spray)
 *  2. Email identity   (if email supplied — anti-multi-IP spray on same email)
 *
 * Stricter limits than login to protect the OTP issuance pipeline.
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
  FORGOT_PASSWORD,
  FORGOT_PASSWORD_EMAIL,
} from '../config/throttle.config';

@Injectable()
export class ForgotPasswordThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const body = (req.body as Record<string, unknown> | undefined) ?? {};

    const layers: ThrottleLayer[] = [
      {
        identifier: buildHybridIpKey(req),
        config: {
          keyPrefix: FORGOT_PASSWORD.KEY_PREFIX,
          ttlSeconds: FORGOT_PASSWORD.TTL_SECONDS,
          limit: FORGOT_PASSWORD.LIMIT,
          blockSeconds: FORGOT_PASSWORD.BLOCK_SECONDS,
          identifierType: 'ip+ua+device',
        },
      },
    ];

    // Email identity layer — only when email is the chosen identifier
    const email = body['email'];
    if (typeof email === 'string' && email.includes('@')) {
      layers.push({
        identifier: email.toLowerCase().trim(),
        config: {
          keyPrefix: FORGOT_PASSWORD_EMAIL.KEY_PREFIX,
          ttlSeconds: FORGOT_PASSWORD_EMAIL.TTL_SECONDS,
          limit: FORGOT_PASSWORD_EMAIL.LIMIT,
          identifierType: 'email',
        },
      });
    }

    return layers;
  }
}
