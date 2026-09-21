/**
 * @fileoverview Verify-OTP throttle guard — multi-layer, strict.
 *
 * OTP brute-force is particularly high-value for attackers (6-digit = 1M space).
 *
 * Layers:
 *  1. IP + UA hash + optional device-id   (per-client, strict)
 *  2. Email identity                       (when email is the identifier)
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
import { VERIFY_OTP, VERIFY_OTP_EMAIL } from '../config/throttle.config';

@Injectable()
export class VerifyOtpThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const body = (req.body as Record<string, unknown> | undefined) ?? {};

    const layers: ThrottleLayer[] = [
      {
        identifier: buildHybridIpKey(req),
        config: {
          keyPrefix: VERIFY_OTP.KEY_PREFIX,
          ttlSeconds: VERIFY_OTP.TTL_SECONDS,
          limit: VERIFY_OTP.LIMIT,
          blockSeconds: VERIFY_OTP.BLOCK_SECONDS,
          identifierType: 'ip+ua+device',
        },
      },
    ];

    const email = body['email'];
    if (typeof email === 'string' && email.includes('@')) {
      layers.push({
        identifier: email.toLowerCase().trim(),
        config: {
          keyPrefix: VERIFY_OTP_EMAIL.KEY_PREFIX,
          ttlSeconds: VERIFY_OTP_EMAIL.TTL_SECONDS,
          limit: VERIFY_OTP_EMAIL.LIMIT,
          identifierType: 'email',
        },
      });
    }

    return layers;
  }
}
