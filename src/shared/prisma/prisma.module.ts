/**
 * @fileoverview Prisma NestJS module.
 *
 * Marked as `@Global()` so PrismaService is available in every
 * feature module without needing to import PrismaModule each time.
 * Only import PrismaModule once — in AppModule.
 *
 * @module shared/prisma
 */
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
