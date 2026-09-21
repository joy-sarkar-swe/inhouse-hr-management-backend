/**
 * @fileoverview MetricsService — Prometheus metrics registry for the cache layer
 * and HTTP tier.
 *
 * Uses a private prom-client `Registry` (not the global default) to avoid
 * polluting process-level metrics when running multiple app instances.
 *
 * Cache metrics are incremented by `CacheOrchestratorService` (which injects
 * this service as `@Optional()` so that test suites without MetricsModule still
 * compile and run cleanly).
 *
 * HTTP metrics are recorded by Fastify `onRequest` / `onResponse` hooks
 * registered in `main.ts`.
 *
 * @module common/metrics
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Counter, Histogram, Registry } from 'prom-client';

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry = new Registry();

  // ── Cache counters ─────────────────────────────────────────────────────────

  private readonly cacheL1Hits: Counter;
  private readonly cacheL1Misses: Counter;
  private readonly cacheBloomBlocks: Counter;
  private readonly cacheL2Hits: Counter;
  private readonly cacheDbFetches: Counter;
  private readonly cacheInvalidations: Counter;

  // ── HTTP metrics ───────────────────────────────────────────────────────────

  private readonly httpRequestsTotal: Counter;
  private readonly httpRequestDuration: Histogram;

  constructor() {
    this.cacheL1Hits = new Counter({
      name: 'cache_l1_hits_total',
      help: 'Total L1 in-process cache hits per namespace',
      labelNames: ['namespace'],
      registers: [this.registry],
    });

    this.cacheL1Misses = new Counter({
      name: 'cache_l1_misses_total',
      help: 'Total L1 in-process cache misses per namespace',
      labelNames: ['namespace'],
      registers: [this.registry],
    });

    this.cacheBloomBlocks = new Counter({
      name: 'cache_bloom_blocks_total',
      help: 'Total requests short-circuited by Bloom filter (key definitively absent)',
      labelNames: ['namespace'],
      registers: [this.registry],
    });

    this.cacheL2Hits = new Counter({
      name: 'cache_l2_hits_total',
      help: 'Total L2 Redis cache hits per namespace',
      labelNames: ['namespace'],
      registers: [this.registry],
    });

    this.cacheDbFetches = new Counter({
      name: 'cache_db_fetches_total',
      help: 'Total database fetcher calls (L1 + L2 miss) per namespace',
      labelNames: ['namespace'],
      registers: [this.registry],
    });

    this.cacheInvalidations = new Counter({
      name: 'cache_invalidations_total',
      help: 'Total cache invalidations (explicit evictions) per namespace',
      labelNames: ['namespace'],
      registers: [this.registry],
    });

    this.httpRequestsTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests handled',
      labelNames: ['method', 'route', 'status_code'],
      registers: [this.registry],
    });

    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
      registers: [this.registry],
    });
  }

  /** Log startup notice. */
  onModuleInit(): void {
    this.logger.log('MetricsService initialised — /metrics endpoint active');
  }

  // ── Cache instrumentation API ──────────────────────────────────────────────

  /**
   * Record an L1 cache hit.
   *
   * @param namespace - Cache namespace (e.g. `'order:id'`).
   */
  incCacheL1Hit(namespace: string): void {
    this.cacheL1Hits.inc({ namespace });
  }

  /**
   * Record an L1 cache miss (proceeds to Bloom / L2 / DB).
   *
   * @param namespace - Cache namespace.
   */
  incCacheL1Miss(namespace: string): void {
    this.cacheL1Misses.inc({ namespace });
  }

  /**
   * Record a Bloom filter block — the key is definitively absent, no DB hit.
   *
   * @param namespace - Cache namespace.
   */
  incCacheBloomBlock(namespace: string): void {
    this.cacheBloomBlocks.inc({ namespace });
  }

  /**
   * Record an L2 Redis cache hit.
   *
   * @param namespace - Cache namespace.
   */
  incCacheL2Hit(namespace: string): void {
    this.cacheL2Hits.inc({ namespace });
  }

  /**
   * Record a database fetcher invocation (L1 + L2 both missed).
   *
   * @param namespace - Cache namespace.
   */
  incCacheDbFetch(namespace: string): void {
    this.cacheDbFetches.inc({ namespace });
  }

  /**
   * Record an explicit cache invalidation.
   *
   * @param namespace - Cache namespace.
   */
  incCacheInvalidation(namespace: string): void {
    this.cacheInvalidations.inc({ namespace });
  }

  // ── HTTP instrumentation API ───────────────────────────────────────────────

  /**
   * Record one completed HTTP request.
   *
   * @param method     - HTTP method (GET, POST, …).
   * @param route      - Fastify router path (e.g. `/api/v1/orders/:id`).
   * @param statusCode - HTTP response status code as string.
   */
  incHttpRequest(method: string, route: string, statusCode: string): void {
    this.httpRequestsTotal.inc({ method, route, status_code: statusCode });
  }

  /**
   * Record the duration of one completed HTTP request.
   *
   * @param method      - HTTP method.
   * @param route       - Fastify router path.
   * @param statusCode  - HTTP response status code as string.
   * @param durationSec - Elapsed time in seconds.
   */
  observeHttpDuration(
    method: string,
    route: string,
    statusCode: string,
    durationSec: number,
  ): void {
    this.httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      durationSec,
    );
  }

  // ── Scrape API ─────────────────────────────────────────────────────────────

  /**
   * Render all metrics as Prometheus text format.
   *
   * @returns Prometheus exposition string.
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Returns the Prometheus text-format Content-Type header value.
   *
   * @returns Content-Type string for Prometheus scrape responses.
   */
  getContentType(): string {
    return this.registry.contentType;
  }
}
