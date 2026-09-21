/**
 * @fileoverview General email queue provider.
 *
 * Creates the BullMQ {@link Queue} instance for general-purpose transactional
 * emails. Backed by `REDIS_DB_EMAIL_QUEUE`.
 *
 * Injection token: {@link EMAIL_QUEUE}
 *
 * @module email-service/test-email-service
 */
import { Provider } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisClientService } from 'src/common/redis/redis.client';
import { EMAIL_QUEUE } from '../constants/email.constants';

/**
 * EmailQueueProvider is a factory provider that creates and configures
 * the BullMQ queue instance for emails.
 */
export const EmailQueueProvider: Provider = {
  provide: EMAIL_QUEUE,
  inject: [RedisClientService],
  useFactory: (redisClientService: RedisClientService) => {
    return new Queue(EMAIL_QUEUE, {
      connection: redisClientService.getClientEmailQueueOptions(),
    });
  },
};
