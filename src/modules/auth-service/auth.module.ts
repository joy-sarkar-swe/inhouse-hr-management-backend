/**
 * @fileoverview Authentication module.
 *
 * Wires together all auth-layer providers:
 *  - AuthService (business logic)
 *  - JwtStrategy (passport strategy)
 *  - JwtAuthGuard (route guard)
 *  - RedisTokenService (session management)
 *  - All throttle guards (registered as providers so NestJS DI can inject them)
 *
 * Imports:
 *  - UserModule    — exposes UserService → UserDAO → Prisma
 *  - JwtModule     — signs/verifies JWTs
 *  - PassportModule — activates passport strategies
 *  - RedisModule   — Redis client for token storage and throttling
 *  - EmailModule   — transactional email via BullMQ auth-email queue
 *
 * @module auth-service
 */
import { Module } from '@nestjs/common';
import { EmailModule } from '../email-service/email.module';
import { UserModule } from '../user-service/user.module';
import { SharedAuthModule } from './shared-auth.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordResetTokenService } from './services/password-reset-token.service';

/**
 * Authentication module.
 *
 * Wires together auth endpoints and services.
 *
 * Dependency order (no circular dependencies):
 *  1. SharedAuthModule — guards, strategies (independent)
 *  2. UserModule — imports SharedAuthModule (depends on SharedAuthModule only)
 *  3. AuthModule — imports UserModule + SharedAuthModule
 *
 * This prevents circular dependencies while maintaining all functionality.
 */
@Module({
  imports: [SharedAuthModule, EmailModule, UserModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetTokenService],
  // Re-export EmailModule so AppModule's QueueLifecycleService can inject
  // the queue tokens it exposes.
  exports: [AuthService, SharedAuthModule, EmailModule],
})
export class AuthModule {}
