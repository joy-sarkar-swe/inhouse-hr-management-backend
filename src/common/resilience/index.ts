/** @fileoverview Re-exports for the resilience module. @module common/resilience */
export {
  CircuitBreakerFactory,
  ManagedCircuitBreaker,
} from './circuit-breaker.factory';
export type { CircuitBreakerCreateOptions } from './circuit-breaker.factory';
export { ResilienceModule } from './resilience.module';
