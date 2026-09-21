/**
 * @fileoverview Auth email queue provider.
 *
 * Creates a dedicated BullMQ {@link Queue} instance for authentication-critical
 * emails (OTP delivery, account verification, password reset).
 *
 * **Why a separate queue?**
 * Using an isolated queue — backed by a dedicated Redis DB — guarantees that a
 * spike in general transactional email volume can never delay security-sensitive
 * messages. The auth queue worker also runs at lower concurrency to prevent
 * thundering-herd on SMTP during registration bursts.
 *
 * Injection token: {@link AUTH_EMAIL_QUEUE}
 */
import { Provider } from '@nestjs/common';
import { Queue } from 'bullmq';
import { RedisClientService } from 'src/common/redis/redis.client';
import { AUTH_EMAIL_QUEUE } from '../constants/email.constants';

/**
 * NestJS factory provider that creates the BullMQ queue for auth emails.
 *
 * Registered in {@link EmailModule} and exported so that `AuthService` (and any
 * future service that needs to send auth-critical email) can inject it via
 * `@Inject(AUTH_EMAIL_QUEUE)`.
 */
export const AuthEmailQueueProvider: Provider = {
  provide: AUTH_EMAIL_QUEUE,
  inject: [RedisClientService],
  useFactory: (redisClientService: RedisClientService) => {
    return new Queue(AUTH_EMAIL_QUEUE, {
      connection: redisClientService.getClientAuthEmailQueueOptions(),
    });
  },
};
