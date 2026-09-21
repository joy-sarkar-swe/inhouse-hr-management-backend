/**
 * @fileoverview GcpStorageModule — global module for GCS file upload/delete.
 *
 * Marked @Global() so GcpStorageService is available everywhere without
 * explicit imports. Register once in AppModule.
 *
 * Imports:
 *  - RedisModule    → provides RedisClientService for the signed-URL cache
 *  - ResilienceModule (global) → provides CircuitBreakerFactory for GCS calls
 *
 * @module common/gcp-storage
 */
import { Global, Module } from '@nestjs/common';
import { RedisModule } from 'src/common/redis/redis.module';
import { GcpStorageService } from './gcp-storage.service';
import { SignedUrlCacheService } from './signed-url-cache.service';

@Global()
@Module({
  imports: [RedisModule],
  providers: [GcpStorageService, SignedUrlCacheService],
  exports: [GcpStorageService, SignedUrlCacheService],
})
export class GcpStorageModule {}
