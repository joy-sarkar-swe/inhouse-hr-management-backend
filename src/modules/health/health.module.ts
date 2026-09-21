/**
 * @fileoverview HealthModule — NestJS module for application liveness probes.
 *
 * Registers the {@link HealthController} and {@link HealthService} so the
 * `GET /api/health` endpoint is available to load balancers and uptime monitors.
 *
 * @module health
 */
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
