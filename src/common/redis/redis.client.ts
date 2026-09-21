/**
 * @fileoverview Redis client service — manages all isolated Redis connections.
 *
 * Each logical concern gets its own ioredis instance pointing at a dedicated
 * Redis DB index so that a backlog in one domain (e.g. email queues) can never
 * evict keys in another (e.g. auth tokens or throttle counters):
 *
 *  - DB 1  — auth tokens              (`REDIS_DB_AUTH`)
 *  - DB 3  — throttle counters        (`REDIS_DB_THROTTLE`)
 *  - DB 4  — general email queue      (`REDIS_DB_EMAIL_QUEUE`)
 *  - DB 5  — auth OTP email queue     (`REDIS_DB_AUTH_EMAIL_QUEUE`)
 *  - DB 12 — L2 cache / Bloom / GCS   (`REDIS_DB_SIGNED_URL_CACHE`)
 *
 * Queue connections are returned as plain `RedisOptions` rather than `Redis`
 * instances to avoid the dual-ioredis type conflict (BullMQ bundles its own).
 *
 * To add a new isolated Redis DB for a future queue or cache, follow the
 * existing pattern: add a `REDIS_DB_*` key to `AppConfig`, construct the
 * client (or `getClient*QueueOptions()` method) here, and close it in
 * `onApplicationShutdown()`.
 *
 * @module common/redis
 */
import { Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';
import config from 'src/shared/config/app.config';

/**
 * Manages dedicated Redis connections for auth tokens, throttling, and queues.
 * Implements `OnApplicationShutdown` to gracefully close connections on shutdown.
 */
@Injectable()
export class RedisClientService implements OnApplicationShutdown {
  private readonly logger = new Logger(RedisClientService.name);
  private readonly clientAuth: Redis;
  private readonly clientThrottle: Redis;
  private readonly clientSignedUrlCache: Redis;

  constructor() {
    this.clientAuth = new Redis({
      host: config.REDIS_HOST ?? '127.0.0.1',
      port: Number(config.REDIS_PORT ?? 6379),
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB_AUTH ? Number(config.REDIS_DB_AUTH) : undefined,
    });
    this.clientAuth.on('error', (err) =>
      this.logger.debug(`Auth Redis client error: ${err.message}`),
    );

    this.logger.debug(
      `Auth Redis -> host=${config.REDIS_HOST}, port=${config.REDIS_PORT}, db=${config.REDIS_DB_AUTH}`,
    );

    /** Throttle-scoped Redis client. */
    this.clientThrottle = new Redis({
      host: config.REDIS_HOST ?? '127.0.0.1',
      port: Number(config.REDIS_PORT ?? 6379),
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB_THROTTLE
        ? Number(config.REDIS_DB_THROTTLE)
        : undefined,
    });
    this.clientThrottle.on('error', (err) =>
      this.logger.debug(`Throttle Redis client error: ${err.message}`),
    );

    this.logger.debug(
      `Throttle Redis -> host=${config.REDIS_HOST}, port=${config.REDIS_PORT}, db=${config.REDIS_DB_THROTTLE}`,
    );

    /** Signed-URL cache Redis client (isolated DB to avoid evicting auth/throttle keys). */
    this.clientSignedUrlCache = new Redis({
      host: config.REDIS_HOST ?? '127.0.0.1',
      port: Number(config.REDIS_PORT ?? 6379),
      password: config.REDIS_PASSWORD || undefined,
      db: Number(config.REDIS_DB_SIGNED_URL_CACHE),
    });
    this.clientSignedUrlCache.on('error', (err) =>
      this.logger.debug(`Signed-URL Cache Redis client error: ${err.message}`),
    );

    this.logger.debug(
      `Signed-URL Cache Redis -> host=${config.REDIS_HOST}, port=${config.REDIS_PORT}, db=${config.REDIS_DB_SIGNED_URL_CACHE}`,
    );
  }

  /** Returns the auth-scoped Redis client. */
  getClientAuth() {
    return this.clientAuth;
  }

  /** Returns the throttle-scoped Redis client. */
  getClientThrottle() {
    return this.clientThrottle;
  }

  /**
   * Returns the signed-URL cache Redis client.
   *
   * Used by `SignedUrlCacheService` to cache short-lived GCS signed URLs, and
   * as the backing store for the L2 cache and Bloom filter (see `AppCacheModule`).
   */
  getClientSignedUrlCache() {
    return this.clientSignedUrlCache;
  }

  /**
   * Returns plain connection options for the general email queue.
   * Use this when passing a connection to BullMQ to avoid the
   * dual-ioredis type conflict (BullMQ bundles its own ioredis).
   */
  getClientEmailQueueOptions(): RedisOptions {
    return {
      host: config.REDIS_HOST ?? '127.0.0.1',
      port: Number(config.REDIS_PORT ?? 6379),
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB_EMAIL_QUEUE
        ? Number(config.REDIS_DB_EMAIL_QUEUE)
        : undefined,
    };
  }

  /**
   * Returns plain connection options for the auth/OTP email queue.
   *
   * Deliberately isolated to its own Redis DB so that a general-email
   * backlog can never starve time-sensitive authentication messages.
   */
  getClientAuthEmailQueueOptions(): RedisOptions {
    return {
      host: config.REDIS_HOST ?? '127.0.0.1',
      port: Number(config.REDIS_PORT ?? 6379),
      password: config.REDIS_PASSWORD || undefined,
      db: config.REDIS_DB_AUTH_EMAIL_QUEUE
        ? Number(config.REDIS_DB_AUTH_EMAIL_QUEUE)
        : undefined,
    };
  }

  /** Gracefully close all Redis connections on application shutdown. */
  async onApplicationShutdown(_signal?: string) {
    const clients = [
      this.clientAuth,
      this.clientThrottle,
      this.clientSignedUrlCache,
    ];
    await Promise.allSettled(
      clients.map(async (client) => {
        try {
          await client.quit();
        } catch {
          client.disconnect();
        }
      }),
    );
  }
}
