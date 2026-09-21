/**
 * @fileoverview DTO for verifying an email address change (step 2 of 2).
 *
 * The authenticated user supplies the 6-digit OTP delivered to the new email
 * address to confirm ownership and complete the email switch.
 *
 * @module auth-service/dto/validation
 */
import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';

export class ChangeEmailVerifyDto {
  @ApiProperty({
    example: '483920',
    description:
      '6-digit OTP sent to the new email address during the initiate step.',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'otp must be exactly 6 digits' })
  @Matches(/^\d{6}$/, { message: 'otp must contain exactly 6 numeric digits' })
  otp!: string;
}
