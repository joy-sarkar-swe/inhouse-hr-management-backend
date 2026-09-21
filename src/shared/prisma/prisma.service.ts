/**
 * @fileoverview NestJS-injectable Prisma client wrapper.
 *
 * Why a service wrapper instead of using PrismaClient directly?
 *  - NestJS DI: inject PrismaService wherever DB access is needed
 *    without instantiating the client manually.
 *  - Lifecycle hooks: gracefully connect on bootstrap and
 *    disconnect on shutdown — prevents connection leaks.
 *  - Single instance: NestJS module system guarantees one
 *    PrismaClient instance per app (no connection pool bloat).
 *  - Testability: easy to mock PrismaService in unit tests.
 *
 * @module shared/prisma
 */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  /**
   * Connect to PostgreSQL when the NestJS module initializes.
   * Fails fast on bad DATABASE_URL — crash loudly, not silently.
   */
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
      this.logger.log('✅ PostgreSQL connected via Prisma');
    } catch (error) {
      this.logger.error('❌ Failed to connect to PostgreSQL', error);
      throw error; // bubble up so the app doesn't start in broken state
    }
  }

  /**
   * Gracefully disconnect when the module is torn down.
   * Prevents hanging connections during hot-reload in dev.
   */
  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('PostgreSQL disconnected');
  }
}
