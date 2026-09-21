/**
 * @fileoverview Swagger DTOs for 429 Throttling Error responses in the Auth module.
 */
import { ApiProperty } from '@nestjs/swagger';
import { CustomTooManyRequestsDto } from 'src/common/dto/custom-throttler.dto';
import { Methods } from 'src/common/enum/methods.enum';

const THROTTLE_MSG_DESC = 'Rate limit exceeded message.';
const THROTTLE_MSG_EXAMPLE = 'Too many requests. Please try again later.';

// ─── Per-endpoint throttle DTOs ───────────────────────────────────────────────

export class RegisterThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/register' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}

export class LoginThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/login' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}

export class ForgotPasswordThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/forgot-password' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}

export class VerifyOtpThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/forget-password-verify-otp' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}

export class ResetPasswordThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/reset-password' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}

export class ChangePasswordThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/change-password' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}

export class RefreshTokenThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/refresh-token' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}

export class ChangeEmailThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/change-email/initiate' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}

export class ResendVerificationOtpThrottleResponseDto extends CustomTooManyRequestsDto {
  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/resend-verification-otp' })
  declare endpoint: string;

  @ApiProperty({
    example: THROTTLE_MSG_EXAMPLE,
    description: THROTTLE_MSG_DESC,
  })
  declare error: string;
}
