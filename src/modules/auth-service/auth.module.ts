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
 *  - UserModule     — exposes UserService → UserDAO → Prisma
 *  - EmployeeModule — exposes EmployeeService, used at login/refresh to
 *                     resolve the Employee record linked to an EMPLOYEE-role
 *                     user so the JWT can carry `employeeId`. EmployeeModule
 *                     has no dependency on AuthModule (or anything that
 *                     depends on it), so this import direction is safe.
 *  - JwtModule     — signs/verifies JWTs
 *  - PassportModule — activates passport strategies
 *  - RedisModule   — Redis client for token storage and throttling
 *  - EmailModule   — transactional email via BullMQ auth-email queue
 *
 * @module auth-service
 */
import { Module } from '@nestjs/common';
import { EmailModule } from '../email-service/email.module';
import { EmployeeModule } from '../employee-service/employee.module';
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
 *  3. EmployeeModule — independent (Employee DAO/service only)
 *  4. AuthModule — imports UserModule + EmployeeModule + SharedAuthModule
 *
 * This prevents circular dependencies while maintaining all functionality.
 */
@Module({
  imports: [SharedAuthModule, EmailModule, UserModule, EmployeeModule],
  controllers: [AuthController],
  providers: [AuthService, PasswordResetTokenService],
  // Re-export EmailModule so AppModule's QueueLifecycleService can inject
  // the queue tokens it exposes.
  exports: [AuthService, SharedAuthModule, EmailModule],
})
export class AuthModule {}
