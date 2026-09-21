/**
 * @fileoverview Global Redis module.
 *
 * Provides and exports RedisClientService and RedisTokenService
 * application-wide. Marked `@Global()` so consumers do not need
 * to import this module explicitly.
 */
import { Global, Module } from '@nestjs/common';
import { RedisTokenService } from './redis-service/auth/redis-token.service';
import { RedisClientService } from './redis.client';

/**
 * Global Redis module that provides and exports Redis infrastructure services.
 */
@Global()
@Module({
  /**
   * Providers array includes the RedisService, which is responsible for managing Redis connections and operations. This service can be injected into other services or controllers that require Redis functionality, such as the JwtStrategy for token validation.
   */
  providers: [RedisClientService, RedisTokenService],

  /**
   * Exports array makes the RedisService available for injection in other modules of the application. By exporting the RedisService, we can ensure that any module that imports the RedisModule can access and utilize the RedisService for its operations, facilitating a modular and reusable architecture.
   */
  exports: [RedisClientService, RedisTokenService],
})
export class RedisModule {}
