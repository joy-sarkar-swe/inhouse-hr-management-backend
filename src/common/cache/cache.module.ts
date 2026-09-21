/**
 * @fileoverview AppCacheModule — global three-tier cache module.
 *
 * Registers and exports:
 *  - {@link L1CacheService}           — bounded in-process LRU (500 entries, 30 s TTL)
 *  - {@link BloomFilterService}       — Redis SETBIT/GETBIT Bloom filter; no RedisBloom module required
 *  - {@link CacheOrchestratorService} — L1 → Bloom → L2 → DB pipeline with request coalescing,
 *                                       TTL jitter, and fail-open semantics
 *  - {@link BloomRebuildService}      — Scheduled atomic Bloom filter rebuild using shadow-key +
 *                                       RENAME pattern with distributed locking and chunked DB reads.
 *                                       @Cron() decorator is discovered by ScheduleModule (registered
 *                                       globally by SubscriptionModule) — no extra imports needed here.
 *
 * `@Global()` means no module needs to import AppCacheModule explicitly —
 * all four services are available application-wide once `AppModule` imports it.
 *
 * @module common/cache
 */
import { Global, Module } from '@nestjs/common';
import { PrismaModule } from 'src/shared/prisma/prisma.module';
import { RedisModule } from '../redis/redis.module';
import { BloomFilterService } from './bloom-filter.service';
import { BloomRebuildService } from './bloom-rebuild.service';
import { CacheOrchestratorService } from './cache-orchestrator.service';
import { L1CacheService } from './l1-cache.service';

@Global()
@Module({
  imports: [RedisModule, PrismaModule],
  providers: [
    L1CacheService,
    BloomFilterService,
    CacheOrchestratorService,
    BloomRebuildService,
  ],
  exports: [
    L1CacheService,
    BloomFilterService,
    CacheOrchestratorService,
    BloomRebuildService,
  ],
})
export class AppCacheModule {}
