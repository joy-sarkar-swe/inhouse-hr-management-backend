/**
 * @fileoverview Authentication controller.
 *
 * Thin HTTP delegation layer — all business logic lives in {@link AuthService}.
 *
 * ── Throttle guard strategy ───────────────────────────────────────────────────
 *
 * All throttle guards use the multi-layer sliding-window algorithm:
 *  - IP layer:      hybrid key (IP + UA hash + optional device-id)
 *  - Identity layer: email / userId extracted from request
 *
 * Guards are disabled in NODE_ENV !== 'production' to allow dev/test freedom.
 * Set NODE_ENV=production (or override env) in staging to enable full protection.
 *
 * ── Authenticated endpoints ───────────────────────────────────────────────────
 *
 * change-password and logout run behind JwtAuthGuard. The ChangePasswordThrottleGuard
 * additionally enforces a userId-scoped limit (placed after JwtAuthGuard so
 * request.user is available).
 *
 * The AuthenticatedUserThrottleGuard is exported from AuthModule for use on any
 * route in the application that requires per-user rate limiting post-login.
 *
 * @module auth-service
 */
import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiErrorResponses } from 'src/common/decorators/api-error-response.decorator';
import { ApiSuccessResponse } from 'src/common/decorators/api-success-response.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { ChangeEmailThrottleGuard } from 'src/common/throttles/auth/change-email-throttle.guard';
import { ChangePasswordThrottleGuard } from 'src/common/throttles/auth/change-password-throttle.guard';
import { ForgotPasswordThrottleGuard } from 'src/common/throttles/auth/forgot-password-throttle.guard';
import { LoginThrottleGuard } from 'src/common/throttles/auth/login-throttle.guard';
import { RefreshTokenThrottleGuard } from 'src/common/throttles/auth/refresh-token-throttle.guard';
import { RegisterThrottleGuard } from 'src/common/throttles/auth/register-throttle.guard';
import { ResendVerificationOtpThrottleGuard } from 'src/common/throttles/auth/resend-verification-email-throttle.guard';
import { ResetPasswordThrottleGuard } from 'src/common/throttles/auth/reset-password-throttle.guard';
import { VerifyOtpThrottleGuard } from 'src/common/throttles/auth/verify-otp-throttle.guard';
import config from 'src/shared/config/app.config';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';
import type { ServicePayload } from 'src/shared/interfaces/response.interface';
import { AuthService } from './auth.service';
import {
  ChangeEmailThrottleResponseDto,
  ChangePasswordThrottleResponseDto,
  ForgotPasswordThrottleResponseDto,
  LoginThrottleResponseDto,
  RefreshTokenThrottleResponseDto,
  RegisterThrottleResponseDto,
  ResendVerificationOtpThrottleResponseDto,
  ResetPasswordThrottleResponseDto,
  VerifyOtpThrottleResponseDto,
} from './dto/error/auth-throttler.dto';
import {
  ChangeEmailInitiateValidationErrorResponseDto,
  ChangeEmailVerifyValidationErrorResponseDto,
  ChangePasswordValidationErrorResponseDto,
  ForgotPasswordValidationErrorResponseDto,
  LoginValidationErrorResponseDto,
  RefreshTokenValidationErrorResponseDto,
  RegisterValidationErrorResponseDto,
  ResendVerificationOtpValidationErrorResponseDto,
  ResetPasswordValidationErrorResponseDto,
  VerifyAccountValidationErrorResponseDto,
  VerifyOtpValidationErrorResponseDto,
} from './dto/error/auth-validation-error.dto';
import {
  ChangeEmailInitiateSuccessResponseDto,
  ChangeEmailVerifySuccessResponseDto,
  ChangePasswordSuccessResponseDto,
  ForgetPasswordSuccessResponseDto,
  LoginSuccessResponseDto,
  LogoutAllSuccessResponseDto,
  LogoutSuccessResponseDto,
  RefreshTokenSuccessResponseDto,
  RegisterSuccessResponseDto,
  ResendVerificationOtpSuccessResponseDto,
  ResetPasswordSuccessResponseDto,
  VerifyAccountSuccessResponseDto,
  VerifyOtpSuccessResponseDto,
} from './dto/success/auth-success.dto';
import { ChangeEmailInitiateDto } from './dto/validation/change-email-initiate.dto';
import { ChangeEmailVerifyDto } from './dto/validation/change-email-verify.dto';
import { ChangePasswordDto } from './dto/validation/change-password.dto';
import { ForgotPasswordDto } from './dto/validation/forgot-password.dto';
import { LoginDto } from './dto/validation/login.dto';
import { RefreshTokenDto } from './dto/validation/refresh-token.dto';
import { RegisterDto } from './dto/validation/register.dto';
import { ResendVerificationDto } from './dto/validation/resend-verification.dto';
import { ResetPasswordDto } from './dto/validation/reset-password.dto';
import { VerifyAccountDto } from './dto/validation/verify-account.dto';
import { VerifyOtpDto } from './dto/validation/verify-otp.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { LoginResponseDto } from './interfaces/auth.interface';

/** Whether throttling is active. Disable only in development/test. */
const THROTTLE_ENABLED = config.THROTTLE_ENABLED;

/**
 * REST controller for all authentication-related endpoints.
 */
@ApiTags('Authentication')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // ─────────────────────────────────────────────────────────────────────────
  // REGISTER
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a new user account with an email address and password.
   *
   * Throttled by:
   *  - IP + UA + optional device-id (per-client limit)
   *  - Email identity (prevents multi-IP spray on same email)
   */
  @ApiOperation({
    summary: 'Register a new user',
    description: 'Creates a new account and emails a verification OTP.',
  })
  @ApiSuccessResponse(RegisterSuccessResponseDto, 201)
  @ApiErrorResponses({
    throttle: RegisterThrottleResponseDto,
    validation: RegisterValidationErrorResponseDto,
  })
  @UseGuards(...(THROTTLE_ENABLED ? [RegisterThrottleGuard] : []))
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFY ACCOUNT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Verify an account using the 6-digit OTP delivered at registration.
   */
  @ApiOperation({
    summary: 'Verify account with OTP',
    description:
      'Verify a new account using the `email` and the 6-digit OTP delivered at registration.',
  })
  @ApiSuccessResponse(VerifyAccountSuccessResponseDto, 200)
  @ApiErrorResponses({
    validation: VerifyAccountValidationErrorResponseDto,
  })
  @Post('verify-account')
  async verifyAccount(@Body() dto: VerifyAccountDto) {
    return this.authService.verifyAccount(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESEND VERIFICATION EMAIL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resend the account verification OTP.
   *
   * Throttled by:
   *  - IP + UA + optional device-id
   *  - Email identity
   */
  @ApiOperation({ summary: 'Resend account verification otp' })
  @ApiSuccessResponse(ResendVerificationOtpSuccessResponseDto, 200)
  @ApiErrorResponses({
    throttle: ResendVerificationOtpThrottleResponseDto,
    validation: ResendVerificationOtpValidationErrorResponseDto,
  })
  @UseGuards(...(THROTTLE_ENABLED ? [ResendVerificationOtpThrottleGuard] : []))
  @Post('resend-verification-otp')
  async resendVerificationOtp(@Body() dto: ResendVerificationDto) {
    return this.authService.resendVerificationOtp(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Authenticate a user and issue a Redis-backed JWT session.
   *
   * Throttled by:
   *  - IP + UA + optional device-id (anti-brute-force per client)
   *  - Email identity (anti-multi-IP spray on one account)
   *
   * Returns an opaque `access_token` (Redis session key) used as Bearer token.
   */
  @ApiOperation({ summary: 'Login user' })
  @ApiSuccessResponse(LoginSuccessResponseDto, 200)
  @ApiErrorResponses({
    throttle: LoginThrottleResponseDto,
    validation: LoginValidationErrorResponseDto,
  })
  @UseGuards(...(THROTTLE_ENABLED ? [LoginThrottleGuard] : []))
  @Post('login')
  async login(
    @Body() dto: LoginDto,
  ): Promise<ServicePayload<LoginResponseDto>> {
    return this.authService.login(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // FORGOT PASSWORD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initiate the forgot-password flow (step 1 of 3).
   *
   * Always returns the same safe message to prevent email enumeration.
   *
   * Throttled by:
   *  - IP + UA + optional device-id (strict — OTP issuance is expensive)
   *  - Email identity
   */
  @ApiOperation({
    summary: 'Forgot password request',
    description: 'Emails a password reset OTP if the account exists.',
  })
  @ApiSuccessResponse(ForgetPasswordSuccessResponseDto, 200)
  @ApiErrorResponses({
    throttle: ForgotPasswordThrottleResponseDto,
    validation: ForgotPasswordValidationErrorResponseDto,
  })
  @UseGuards(...(THROTTLE_ENABLED ? [ForgotPasswordThrottleGuard] : []))
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VERIFY OTP
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Verify the password-reset OTP (step 2 of 3).
   *
   * Throttled by:
   *  - IP + UA + optional device-id (strictest — 6-digit OTP brute-force risk)
   *  - Email identity
   */
  @ApiOperation({
    summary: 'Verify OTP for password reset (step 2 of 3)',
    description:
      '`email` and `otp` (6 digits) are required. ' +
      'On success returns `{ reset_token, expires_in }` — pass `reset_token` to ' +
      'POST /auth/reset-password to actually change the password. No need to ' +
      're-supply the OTP. The token is single-use, lower-case hex, and expires ' +
      'in 10 minutes (or sooner if a new OTP is requested for the same user).',
  })
  @ApiSuccessResponse(VerifyOtpSuccessResponseDto, 200)
  @ApiErrorResponses({
    throttle: VerifyOtpThrottleResponseDto,
    validation: VerifyOtpValidationErrorResponseDto,
  })
  @UseGuards(...(THROTTLE_ENABLED ? [VerifyOtpThrottleGuard] : []))
  @Post('forget-password-verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RESET PASSWORD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Reset the user's password (step 3 of 3).
   *
   * Takes the single-use `reset_token` issued by step 2 plus the new password.
   * No email/otp re-entry. The token is atomically consumed on first
   * use (replay-safe). Same JSON contract works for web + mobile clients.
   *
   * Throttled by:
   *  - IP + UA + optional device-id
   */
  @ApiOperation({
    summary: 'Reset password (step 3 of 3)',
    description:
      'Takes `{ reset_token, newPassword }`. The `reset_token` must be a ' +
      'fresh single-use token from POST /auth/forget-password-verify-otp. ' +
      'No need to re-supply email/otp.',
  })
  @ApiSuccessResponse(ResetPasswordSuccessResponseDto, 200)
  @ApiErrorResponses({
    throttle: ResetPasswordThrottleResponseDto,
    validation: ResetPasswordValidationErrorResponseDto,
  })
  @UseGuards(...(THROTTLE_ENABLED ? [ResetPasswordThrottleGuard] : []))
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHANGE PASSWORD
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Change password for an authenticated user.
   *
   * Throttled by:
   *  - Authenticated userId (primary — IP-rotation proof)
   *  - IP + UA + optional device-id (secondary — defence-in-depth)
   *
   * JwtAuthGuard must run before ChangePasswordThrottleGuard so userId is available.
   */
  @ApiOperation({ summary: 'Change password (authenticated)' })
  @ApiBearerAuth('Authorization')
  @ApiSuccessResponse(ChangePasswordSuccessResponseDto, 200)
  @ApiErrorResponses({
    throttle: ChangePasswordThrottleResponseDto,
    validation: ChangePasswordValidationErrorResponseDto,
  })
  @UseGuards(
    JwtAuthGuard,
    ...(THROTTLE_ENABLED ? [ChangePasswordThrottleGuard] : []),
  )
  @Post('change-password')
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(user.id!, dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGOUT
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Log out the current session.
   *
   * Deletes both the access token and its paired refresh token from Redis so
   * neither can be replayed after logout.
   */
  @ApiOperation({ summary: 'Logout current session (authenticated)' })
  @ApiBearerAuth('Authorization')
  @ApiSuccessResponse(LogoutSuccessResponseDto, 200)
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(@CurrentUser() user: AuthUser, @Req() req: any) {
    const redisKey: string = req['redisKey'];
    return this.authService.logout(user.id, redisKey);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // LOGOUT ALL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Log out from ALL active sessions across all devices.
   *
   * Scans Redis and invalidates every access and refresh token belonging to
   * the authenticated user — useful after a security event or password change.
   */
  @ApiOperation({
    summary: 'Logout all sessions / all devices (authenticated)',
    description:
      'Revokes every active access and refresh token for the authenticated user. ' +
      'The current session is also invalidated — the client must log in again.',
  })
  @ApiBearerAuth('Authorization')
  @ApiSuccessResponse(LogoutAllSuccessResponseDto, 200)
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(@CurrentUser() user: AuthUser) {
    return this.authService.logoutAll(user.id!);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REFRESH TOKEN
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Exchange a valid refresh token for a new access + refresh token pair.
   *
   * The old refresh token is deleted on success (token rotation).
   * The client must store the new `refresh_token` and use the new
   * `access_token` for subsequent authenticated requests.
   *
   * Throttled by:
   *  - IP + UA + optional device-id (prevents refresh-token spray attacks)
   */
  @ApiOperation({
    summary: 'Refresh access token using refresh token',
    description:
      'Exchanges the long-lived `refresh_token` for a new short-lived `access_token` ' +
      'and a new `refresh_token` (rotation). The submitted refresh token is revoked. ' +
      'Store the `refresh_token` in HttpOnly cookies or secure storage — never in `localStorage`.',
  })
  @ApiSuccessResponse(RefreshTokenSuccessResponseDto, 200)
  @ApiErrorResponses({
    throttle: RefreshTokenThrottleResponseDto,
    validation: RefreshTokenValidationErrorResponseDto,
  })
  @UseGuards(...(THROTTLE_ENABLED ? [RefreshTokenThrottleGuard] : []))
  @Post('refresh-token')
  async refreshToken(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHANGE EMAIL
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initiate an email address change (step 1 of 2).
   *
   * Sends a 6-digit OTP to the new email address for ownership verification.
   * The OTP expires in 15 minutes.
   *
   * Throttled by:
   *  - Authenticated userId (prevents OTP spam to arbitrary addresses)
   *  - IP + UA + optional device-id (defence-in-depth)
   */
  @ApiOperation({
    summary: 'Initiate email address change (step 1 of 2, authenticated)',
    description:
      'Sends a verification OTP to the new email address. ' +
      'Call `POST /auth/change-email/verify` with the OTP to complete the change.',
  })
  @ApiBearerAuth('Authorization')
  @ApiSuccessResponse(ChangeEmailInitiateSuccessResponseDto, 200)
  @ApiErrorResponses({
    throttle: ChangeEmailThrottleResponseDto,
    validation: ChangeEmailInitiateValidationErrorResponseDto,
  })
  @UseGuards(
    JwtAuthGuard,
    ...(THROTTLE_ENABLED ? [ChangeEmailThrottleGuard] : []),
  )
  @Post('change-email/initiate')
  async changeEmailInitiate(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeEmailInitiateDto,
  ) {
    return this.authService.changeEmailInitiate(user.id!, dto);
  }

  /**
   * Complete an email address change (step 2 of 2).
   *
   * Verifies the OTP sent to the new email address and commits the email
   * update atomically. The pending OTP fields are cleared on success.
   */
  @ApiOperation({
    summary:
      'Verify OTP and complete email address change (step 2 of 2, authenticated)',
  })
  @ApiBearerAuth('Authorization')
  @ApiSuccessResponse(ChangeEmailVerifySuccessResponseDto, 200)
  @ApiErrorResponses({
    validation: ChangeEmailVerifyValidationErrorResponseDto,
  })
  @UseGuards(JwtAuthGuard)
  @Post('change-email/verify')
  async changeEmailVerify(
    @CurrentUser() user: AuthUser,
    @Body() dto: ChangeEmailVerifyDto,
  ) {
    return this.authService.changeEmailVerify(user.id!, dto);
  }
}
