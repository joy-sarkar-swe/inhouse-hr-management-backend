/**
 * @fileoverview Shared authentication utilities module.
 *
 * Provides guards, strategies, and other shared auth components
 * that can be imported by other modules without circular dependencies.
 *
 * This module does NOT import UserModule, breaking the circular
 * dependency cycle.
 *
 * @module auth-service/shared-auth
 */
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RedisTokenService } from 'src/common/redis/redis-service/auth/redis-token.service';
import { RedisModule } from 'src/common/redis/redis.module';
import { ChangeEmailThrottleGuard } from 'src/common/throttles/auth/change-email-throttle.guard';
import { ChangePasswordThrottleGuard } from 'src/common/throttles/auth/change-password-throttle.guard';
import { ForgotPasswordThrottleGuard } from 'src/common/throttles/auth/forgot-password-throttle.guard';
import { LoginThrottleGuard } from 'src/common/throttles/auth/login-throttle.guard';
import { RefreshTokenThrottleGuard } from 'src/common/throttles/auth/refresh-token-throttle.guard';
import { RegisterThrottleGuard } from 'src/common/throttles/auth/register-throttle.guard';
import { ResendVerificationOtpThrottleGuard } from 'src/common/throttles/auth/resend-verification-email-throttle.guard';
import { ResetPasswordThrottleGuard } from 'src/common/throttles/auth/reset-password-throttle.guard';
import { VerifyOtpThrottleGuard } from 'src/common/throttles/auth/verify-otp-throttle.guard';
import { AuthenticatedUserThrottleGuard } from 'src/common/throttles/user/authenticated-user-throttle.guard';
import config from 'src/shared/config/app.config';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: config.JWT_SECRET,
      // Default signOptions apply to access tokens (short-lived).
      // Refresh tokens override expiresIn explicitly in AuthService.
      signOptions: { expiresIn: config.JWT_EXPIRES_IN },
    }),
    RedisModule,
  ],
  providers: [
    JwtStrategy,
    JwtAuthGuard,
    RedisTokenService,
    LoginThrottleGuard,
    RegisterThrottleGuard,
    ForgotPasswordThrottleGuard,
    VerifyOtpThrottleGuard,
    ResetPasswordThrottleGuard,
    ChangePasswordThrottleGuard,
    ResendVerificationOtpThrottleGuard,
    RefreshTokenThrottleGuard,
    ChangeEmailThrottleGuard,
    AuthenticatedUserThrottleGuard,
  ],
  exports: [
    JwtModule,
    JwtAuthGuard,
    JwtStrategy,
    RedisTokenService,
    AuthenticatedUserThrottleGuard,
    LoginThrottleGuard,
    RegisterThrottleGuard,
    ForgotPasswordThrottleGuard,
    VerifyOtpThrottleGuard,
    ResetPasswordThrottleGuard,
    ChangePasswordThrottleGuard,
    ResendVerificationOtpThrottleGuard,
    RefreshTokenThrottleGuard,
    ChangeEmailThrottleGuard,
  ],
})
export class SharedAuthModule {}
