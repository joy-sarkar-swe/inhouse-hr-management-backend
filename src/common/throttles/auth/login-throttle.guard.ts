/**
 * @fileoverview Login throttle guard — multi-layer.
 *
 * Layers enforced (in order):
 *  1. IP + UA hash + optional device-id   (hybrid key, anti-brute-force)
 *  2. Email identity                       (anti-multi-IP spray on one account)
 *
 * The email layer is applied only when the request body contains a valid
 * `email` string — missing or malformed email falls back gracefully to
 * IP-only protection (layer 1 is always present).
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
import { LOGIN, LOGIN_EMAIL } from '../config/throttle.config';

@Injectable()
export class LoginThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    const layers: ThrottleLayer[] = [
      {
        identifier: buildHybridIpKey(req),
        config: {
          keyPrefix: LOGIN.KEY_PREFIX,
          ttlSeconds: LOGIN.TTL_SECONDS,
          limit: LOGIN.LIMIT,
          blockSeconds: LOGIN.BLOCK_SECONDS,
          identifierType: 'ip+ua+device',
        },
      },
    ];

    // Email identity layer — only when email is present in body
    const email = (req.body as Record<string, unknown> | undefined)?.['email'];
    if (typeof email === 'string' && email.includes('@')) {
      layers.push({
        identifier: email.toLowerCase().trim(),
        config: {
          keyPrefix: LOGIN_EMAIL.KEY_PREFIX,
          ttlSeconds: LOGIN_EMAIL.TTL_SECONDS,
          limit: LOGIN_EMAIL.LIMIT,
          identifierType: 'email',
        },
      });
    }

    return layers;
  }
}
