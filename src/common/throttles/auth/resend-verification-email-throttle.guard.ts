/**
 * @fileoverview Resend-verification-email throttle guard — multi-layer.
 *
 * Layers enforced (in order):
 *  1. IP + UA hash + optional device-id   (per-client)
 *  2. Email identity                       (anti-multi-IP spray on same account)
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
  RESEND_VERIFICATION_EMAIL,
  RESEND_VERIFICATION_EMAIL_IDENTITY,
} from '../config/throttle.config';

@Injectable()
export class ResendVerificationOtpThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const layers: ThrottleLayer[] = [
      {
        identifier: buildHybridIpKey(req),
        config: {
          keyPrefix: RESEND_VERIFICATION_EMAIL.KEY_PREFIX,
          ttlSeconds: RESEND_VERIFICATION_EMAIL.TTL_SECONDS,
          limit: RESEND_VERIFICATION_EMAIL.LIMIT,
          identifierType: 'ip+ua+device',
        },
      },
    ];

    const email = (req.body as Record<string, unknown> | undefined)?.['email'];
    if (typeof email === 'string' && email.includes('@')) {
      layers.push({
        identifier: email.toLowerCase().trim(),
        config: {
          keyPrefix: RESEND_VERIFICATION_EMAIL_IDENTITY.KEY_PREFIX,
          ttlSeconds: RESEND_VERIFICATION_EMAIL_IDENTITY.TTL_SECONDS,
          limit: RESEND_VERIFICATION_EMAIL_IDENTITY.LIMIT,
          identifierType: 'email',
        },
      });
    }

    return layers;
  }
}
