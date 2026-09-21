/**
 * @fileoverview Root application module.
 *
 * ── API versioning strategy ──────────────────────────────────────────────────
 *
 * URI versioning is enabled in main.ts via `app.enableVersioning({ type: URI })`.
 * All feature controllers declare `@Version('1')` at the class level so every
 * route they expose becomes `/api/v1/<path>`.
 *
 * ── Module load order ─────────────────────────────────────────────────────────
 *
 * Infrastructure modules load first, then feature modules. AuthModule imports
 * UserModule directly (AuthService depends on UserService), so UserModule does
 * not need to be re-imported here for that purpose — it is listed explicitly
 * anyway because it also registers its own controller (`/profile/*`).
 *
 * @module app
 */
import { Module } from '@nestjs/common';
import { AuthModule } from 'src/modules/auth-service/auth.module';
import { UserModule } from 'src/modules/user-service/user.module';
import { GcpStorageModule } from './common/gcp-storage/gcp-storage.module';
import { AppCacheModule } from './common/cache/cache.module';
import { RedisModule } from './common/redis/redis.module';
import { ResilienceModule } from './common/resilience';
import { DockerLifecycleService } from './common/lifecycle/docker-lifecycle.service';
import { QueueLifecycleService } from './common/lifecycle/queue-lifecycle.service';
import { EmailModule } from './modules/email-service/email.module';
import { EmailTestController } from './modules/email-service/test-email-service/email-test.controller';
import { HealthModule } from './modules/health/health.module';
import { MetricsModule } from './common/metrics/metrics.module';
import { PrismaModule } from './shared/prisma/prisma.module';

@Module({
  imports: [
    // ── Infrastructure ───────────────────────────────────────────────────────
    PrismaModule, // Global PostgreSQL client via Prisma
    RedisModule, // Redis for sessions, queues, throttle
    AppCacheModule, // Global L1/L2 cache + Bloom filter
    ResilienceModule, // Global CircuitBreakerFactory for external integrations
    EmailModule, // Transactional email via BullMQ
    GcpStorageModule, // GCS file upload / delete / signed-url (used by avatar upload)

    // ── Feature modules ───────────────────────────────────────────────────────
    MetricsModule, // GET /metrics (Prometheus scrape endpoint — excluded from /api prefix)
    HealthModule, // GET /health
    AuthModule, // POST /api/v1/auth/*
    UserModule, // GET/PATCH /api/v1/profile/* — user self-service profile
  ],
  // Test/demo controller — gated behind NODE_ENV !== 'production'.
  // For development/testing only; must not be accessible in production.
  controllers:
    process.env.NODE_ENV !== 'production' ? [EmailTestController] : [],
  providers: [
    // Closes every BullMQ producer queue on SIGTERM/SIGINT so the process
    // can exit cleanly during deploys.
    QueueLifecycleService,
    // Stops dev docker containers (PostgreSQL & Redis) on shutdown in development.
    DockerLifecycleService,
  ],
})
export class AppModule {}
