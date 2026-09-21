/**
 * @fileoverview Public API throttle guard — unauthenticated read endpoints.
 *
 * Keyed on IP+UA+device hybrid key. Used on public product list, shop list,
 * category list, location queries, and similar unauthenticated reads.
 *
 * @module throttles/public
 */
import { Injectable } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { RedisClientService } from '../../redis/redis.client';
import {
  BaseThrottleGuard,
  buildHybridIpKey,
  ThrottleLayer,
} from '../base-throttle.guard';
import { PUBLIC_API } from '../config/throttle.config';

/** Rate-limits public (unauthenticated) read endpoints per IP+UA hybrid key. */
@Injectable()
export class PublicApiThrottleGuard extends BaseThrottleGuard {
  constructor(redis: RedisClientService) {
    super(redis);
  }

  protected buildLayers(req: FastifyRequest): ThrottleLayer[] {
    return [
      {
        identifier: buildHybridIpKey(req),
        config: {
          keyPrefix: PUBLIC_API.KEY_PREFIX,
          ttlSeconds: PUBLIC_API.TTL_SECONDS,
          limit: PUBLIC_API.LIMIT,
          identifierType: 'ip+ua+device',
        },
      },
    ];
  }
}
