/**
 * @fileoverview MetricsModule — global Prometheus metrics registry.
 *
 * Marked `@Global()` so that `MetricsService` can be injected anywhere in the
 * application (especially into `CacheOrchestratorService` as an optional dep)
 * without having to import this module everywhere.
 *
 * Import once in `AppModule`; the `MetricsController` registers `GET /metrics`
 * which is excluded from the global `/api` prefix in `main.ts`.
 *
 * @module common/metrics
 */
import { Global, Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  controllers: [MetricsController],
  providers: [MetricsService],
  exports: [MetricsService],
})
export class MetricsModule {}
