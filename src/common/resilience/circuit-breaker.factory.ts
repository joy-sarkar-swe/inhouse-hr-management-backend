/**
 * @fileoverview CircuitBreakerFactory — single source of truth for circuit breakers.
 *
 * Provides a small, opinionated wrapper over the `opossum` library so every
 * outbound integration (EPS, GCS, SMS gateway, …) gets:
 *
 *   - Uniform timeout / threshold / volume defaults driven by env vars.
 *   - Per-breaker overrides for slow vs fast integrations.
 *   - Structured state-change logs (open / half-open / close / fallback / timeout).
 *   - A `fire<T>()` helper that converts "circuit open" fallbacks into a
 *     clean `ServiceUnavailableException` instead of a confusing sentinel.
 *   - Automatic teardown on `onApplicationShutdown` so SIGTERM unblocks
 *     promptly during deploys.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *
 *   constructor(private readonly cb: CircuitBreakerFactory) {}
 *
 *   onModuleInit() {
 *     this.gcsBreaker = this.cb.create({
 *       name:    'gcs-signing',
 *       timeout: 5_000,           // tighter than the default 10s
 *     });
 *   }
 *
 *   async sign(p: string) {
 *     return this.gcsBreaker.fire(() => this.gcs.getSignedUrl(p));
 *   }
 *
 * Each breaker maintains its own stats — `getStatus()` returns a map of all
 * registered breakers, suitable for an admin health endpoint.
 *
 * @module common/resilience
 */
import {
  Injectable,
  Logger,
  OnApplicationShutdown,
  ServiceUnavailableException,
} from '@nestjs/common';
import CircuitBreaker from 'opossum';
import config from 'src/shared/config/app.config';

type AsyncFn<T> = () => Promise<T>;

/** Sentinel value used to distinguish "circuit open" from regular nullish returns. */
const CIRCUIT_OPEN_SENTINEL = Symbol('CIRCUIT_OPEN');

export interface CircuitBreakerCreateOptions {
  /** Identifier shown in logs and the health endpoint. */
  name: string;
  /** Override per-call timeout (ms). Defaults to `CB_CALL_TIMEOUT_MS`. */
  timeout?: number;
  /** Override error rate threshold (0-100). Defaults to `CB_ERROR_THRESHOLD_PERCENTAGE`. */
  errorThresholdPercentage?: number;
  /** Override reset timeout (ms) before half-open probe. Defaults to `CB_RESET_TIMEOUT_MS`. */
  resetTimeout?: number;
  /** Override minimum call count before threshold evaluation. Defaults to `CB_VOLUME_THRESHOLD`. */
  volumeThreshold?: number;
  /**
   * Exception class to throw when the circuit is open.
   * Defaults to NestJS `ServiceUnavailableException` with a generic message.
   */
  openExceptionFactory?: () => Error;
}

/**
 * A typed handle over an opossum breaker. The factory returns this so callers
 * don't have to import opossum themselves.
 */
export class ManagedCircuitBreaker {
  constructor(
    private readonly breaker: CircuitBreaker<[AsyncFn<unknown>], unknown>,
    private readonly openExceptionFactory: () => Error,
    public readonly name: string,
  ) {}

  /**
   * Run `fn` through the circuit. Throws `openExceptionFactory()` if the
   * breaker is open or the fallback fires; rethrows the underlying error
   * otherwise.
   */
  async fire<T>(fn: AsyncFn<T>): Promise<T> {
    const result = await (this.breaker.fire(fn) as Promise<
      T | typeof CIRCUIT_OPEN_SENTINEL
    >);
    if ((result as unknown) === CIRCUIT_OPEN_SENTINEL) {
      throw this.openExceptionFactory();
    }
    return result as T;
  }

  /** Current state and per-breaker stats — for health endpoints. */
  getStatus() {
    const s = this.breaker.stats;
    return {
      name: this.name,
      state: this.breaker.opened
        ? 'OPEN'
        : this.breaker.halfOpen
          ? 'HALF_OPEN'
          : 'CLOSED',
      stats: {
        fires: s.fires ?? 0,
        successes: s.successes ?? 0,
        failures: s.failures ?? 0,
        rejects: s.rejects ?? 0,
        timeouts: s.timeouts ?? 0,
        fallbacks: s.fallbacks ?? 0,
      },
    };
  }

  /** Tear the underlying breaker down (called by the factory on shutdown). */
  shutdown(): void {
    this.breaker.shutdown();
  }
}

@Injectable()
export class CircuitBreakerFactory implements OnApplicationShutdown {
  private readonly logger = new Logger(CircuitBreakerFactory.name);
  private readonly registry = new Map<string, ManagedCircuitBreaker>();

  create(opts: CircuitBreakerCreateOptions): ManagedCircuitBreaker {
    if (this.registry.has(opts.name)) {
      throw new Error(
        `CircuitBreaker "${opts.name}" already registered — use unique names per integration.`,
      );
    }

    const errorThreshold =
      opts.errorThresholdPercentage ?? config.CB_ERROR_THRESHOLD_PERCENTAGE;
    const resetTimeout = opts.resetTimeout ?? config.CB_RESET_TIMEOUT_MS;
    const callTimeout = opts.timeout ?? config.CB_CALL_TIMEOUT_MS;
    const volumeMin = opts.volumeThreshold ?? config.CB_VOLUME_THRESHOLD;

    const breaker = new CircuitBreaker<[AsyncFn<unknown>], unknown>(
      async (fn) => fn(),
      {
        name: opts.name,
        errorThresholdPercentage: errorThreshold,
        resetTimeout,
        timeout: callTimeout,
        volumeThreshold: volumeMin,
      },
    );

    breaker.fallback(() => CIRCUIT_OPEN_SENTINEL);

    breaker.on('open', () =>
      this.logger.error(
        `🔴 [CB:${opts.name}] OPEN — failure rate ≥ ${errorThreshold}%. ` +
          `Fast-failing all calls for ${resetTimeout / 1_000}s.`,
      ),
    );
    breaker.on('halfOpen', () =>
      this.logger.warn(`🟡 [CB:${opts.name}] HALF-OPEN — probing.`),
    );
    breaker.on('close', () =>
      this.logger.log(`🟢 [CB:${opts.name}] CLOSED — recovered.`),
    );
    breaker.on('timeout', () =>
      this.logger.warn(
        `[CB:${opts.name}] Call timed out after ${callTimeout}ms.`,
      ),
    );
    breaker.on('reject', () =>
      this.logger.warn(`[CB:${opts.name}] Call rejected — circuit OPEN.`),
    );
    breaker.on('failure', (err: Error) =>
      this.logger.warn(`[CB:${opts.name}] Call failed: ${err.message}`),
    );

    const openExceptionFactory =
      opts.openExceptionFactory ??
      (() =>
        new ServiceUnavailableException(
          `Service "${opts.name}" temporarily unavailable. Please retry shortly.`,
        ));

    const managed = new ManagedCircuitBreaker(
      breaker,
      openExceptionFactory,
      opts.name,
    );
    this.registry.set(opts.name, managed);

    this.logger.log(
      `Circuit breaker "${opts.name}" registered — ` +
        `threshold=${errorThreshold}% ` +
        `resetTimeout=${resetTimeout}ms ` +
        `callTimeout=${callTimeout}ms ` +
        `minVolume=${volumeMin}`,
    );

    return managed;
  }

  /** Look up a previously-registered breaker (returns undefined if missing). */
  get(name: string): ManagedCircuitBreaker | undefined {
    return this.registry.get(name);
  }

  /** Snapshot of every registered breaker — for `/admin/health/circuits`. */
  getAllStatuses() {
    return Array.from(this.registry.values()).map((b) => b.getStatus());
  }

  async onApplicationShutdown(signal?: string): Promise<void> {
    this.logger.log(
      `Tearing down ${this.registry.size} circuit breaker(s) on signal=${signal ?? 'unknown'}`,
    );
    for (const breaker of this.registry.values()) {
      breaker.shutdown();
    }
    this.registry.clear();
  }
}
