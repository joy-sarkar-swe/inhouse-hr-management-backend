/**
 * @fileoverview Swagger success-response DTOs for Auth endpoints.
 */
import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from 'src/common/dto/success-response.dto';
import { Methods } from 'src/common/enum/methods.enum';
import type {
  LoginResponseDto,
  RefreshResponseDto,
} from '../../interfaces/auth.interface';

// ─── Register ────────────────────────────────────────────────────────────────

export class RegisterSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({
    example:
      'Registration successful. Please check your email for a verification code.',
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/register' })
  declare endpoint: string;

  @ApiProperty({ example: 201 })
  declare statusCode: number;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Verify account ───────────────────────────────────────────────────────────

export class VerifyAccountSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({
    example: 'Account verified successfully. You can now log in.',
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/verify-account' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Resend verification OTP ────────────────────────────────────────────────

export class ResendVerificationOtpSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({
    example: 'If an account exists, a new verification code has been sent.',
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/resend-verification-otp' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Login ────────────────────────────────────────────────────────────────────

export class LoginSuccessResponseDto extends SuccessResponseDto<LoginResponseDto> {
  @ApiProperty({ example: 'Login successful.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/login' })
  declare endpoint: string;

  @ApiProperty({
    example: {
      access_token:
        '69b8bba8-f2e6-bd15-2e34-b0f1a1234567:c7f3e91a-4b2d-4e8f-9a1c-3d5f7b2e6a04',
      refresh_token:
        'refresh:69b8bba8-f2e6-bd15-2e34-b0f1a1234567:c7f3e91a-4b2d-4e8f-9a1c-3d5f7b2e6a04',
      token_type: 'Bearer',
      expires_in: 900,
      user: {
        email: 'user@example.com',
        fullName: 'John Doe',
        role: 'CUSTOMER',
      },
    },
  })
  declare data: LoginResponseDto;
}

// ─── Forgot password ──────────────────────────────────────────────────────────

export class ForgetPasswordSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({
    example: 'If an account exists, a password reset code has been sent.',
    description:
      'Enumeration-resistant message — always returned regardless of whether the email exists.',
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/forgot-password' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

export class VerifyOtpDataDto {
  @ApiProperty({
    example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    description:
      'Single-use reset token (lower-case hex, 64 chars). Pass to ' +
      'POST /auth/reset-password as `reset_token` to set the new password ' +
      'without re-entering the OTP. Expires after 10 minutes or first use.',
  })
  reset_token!: string;

  @ApiProperty({
    example: 600,
    description: 'Token TTL in seconds (10 minutes).',
  })
  expires_in!: number;
}

export class VerifyOtpSuccessResponseDto extends SuccessResponseDto<VerifyOtpDataDto> {
  @ApiProperty({ example: 'Code verified. You may now reset your password.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/forget-password-verify-otp' })
  declare endpoint: string;

  @ApiProperty({ type: VerifyOtpDataDto })
  declare data: VerifyOtpDataDto;
}

// ─── Reset password ───────────────────────────────────────────────────────────

export class ResetPasswordSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({ example: 'Password reset successfully. You can now log in.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/reset-password' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Change password ──────────────────────────────────────────────────────────

export class ChangePasswordSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({ example: 'Password changed successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/change-password' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Logout ───────────────────────────────────────────────────────────────────

export class LogoutSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({ example: 'Logged out successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/logout' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Logout All ──────────────────────────────────────────────────────────────

export class LogoutAllSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({ example: 'Logged out from all devices successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/logout-all' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Refresh token ────────────────────────────────────────────────────────────

export class RefreshTokenSuccessResponseDto extends SuccessResponseDto<RefreshResponseDto> {
  @ApiProperty({ example: 'Token refreshed successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/refresh-token' })
  declare endpoint: string;

  @ApiProperty({
    example: {
      access_token:
        '69b8bba8-f2e6-bd15-2e34-b0f1a1234567:d9e4f02b-5c3a-4f7e-8b2d-4e6f8c1a7b05',
      refresh_token:
        'refresh:69b8bba8-f2e6-bd15-2e34-b0f1a1234567:d9e4f02b-5c3a-4f7e-8b2d-4e6f8c1a7b05',
      token_type: 'Bearer',
      expires_in: 900,
      user: {
        email: 'user@example.com',
        fullName: 'John Doe',
        role: 'CUSTOMER',
      },
    },
  })
  declare data: RefreshResponseDto;
}

// ─── Change email — initiate ──────────────────────────────────────────────────

export class ChangeEmailInitiateSuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({
    example: 'A verification code has been sent to your new email.',
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/change-email/initiate' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}

// ─── Change email — verify ────────────────────────────────────────────────────

export class ChangeEmailVerifySuccessResponseDto extends SuccessResponseDto<null> {
  @ApiProperty({ example: 'Email address updated successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/auth/change-email/verify' })
  declare endpoint: string;

  @ApiProperty({ example: null })
  declare data: null;
}
