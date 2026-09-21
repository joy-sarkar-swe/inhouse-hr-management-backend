/**
 * @fileoverview DTO for password reset — step 3 of 3.
 *
 * Takes a single-use `reset_token` (returned by step 2 verify-otp) plus the
 * new password. No need to re-supply email/otp — the token proves the
 * caller already verified the OTP.
 *
 * Mobile-friendly: same JSON body shape for web + mobile clients.
 *
 * @module auth-service/dto/validation
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    description:
      'Single-use reset token returned by POST /auth/forget-password-verify-otp. ' +
      'Lower-case hex, ~64 chars. Expires after 10 minutes or first use.',
    example: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    minLength: 32,
    maxLength: 256,
  })
  @IsString()
  @IsNotEmpty()
  @Length(32, 256)
  @Matches(/^[a-f0-9]+$/, { message: 'Reset token must be lowercase hex.' })
  reset_token!: string;

  @ApiProperty({
    example: 'NewPassword123!',
    description:
      'Min 8 characters. Must contain at least one uppercase letter, ' +
      'one lowercase letter, one digit, and one special character.',
    minLength: 8,
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/, {
    message:
      'Password must contain at least one uppercase, lowercase, number and special character',
  })
  newPassword!: string;
}
