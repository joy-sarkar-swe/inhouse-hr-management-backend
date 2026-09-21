/**
 * @fileoverview ResilienceModule — global circuit-breaker infrastructure.
 *
 * Marked `@Global()` so any feature module can inject `CircuitBreakerFactory`
 * without importing this module explicitly.
 *
 * @module common/resilience
 */
import { Global, Module } from '@nestjs/common';
import { CircuitBreakerFactory } from './circuit-breaker.factory';

@Global()
@Module({
  providers: [CircuitBreakerFactory],
  exports: [CircuitBreakerFactory],
})
export class ResilienceModule {}
