/**
 * @fileoverview MetricsController — Prometheus scrape endpoint.
 *
 * Serves `GET /metrics` in Prometheus text exposition format.
 * This controller is intentionally registered WITHOUT the global `/api` prefix
 * (excluded in `main.ts`) and WITHOUT any auth guard, so that Prometheus
 * scrapers can reach it without a Bearer token.
 *
 * It uses the raw Fastify reply to bypass the global `ResponseInterceptor`
 * (which would otherwise wrap the plain-text output in the JSON envelope).
 *
 * @module common/metrics
 */
import { Controller, Get, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { MetricsService } from './metrics.service';

@ApiExcludeController()
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Prometheus scrape endpoint.
   *
   * Returns all registered metrics in the standard text exposition format.
   * Consumers: Prometheus server, Grafana Agent, DataDog Agent, etc.
   *
   * @param reply - Raw Fastify reply — bypasses global `ResponseInterceptor`.
   */
  @Get()
  async scrape(@Res() reply: FastifyReply): Promise<void> {
    const body = await this.metricsService.getMetrics();
    reply
      .header('Content-Type', this.metricsService.getContentType())
      .send(body);
  }
}
