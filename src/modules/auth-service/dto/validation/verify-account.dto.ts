/**
 * @fileoverview DTO for account verification via OTP.
 *
 * @module auth-service/dto/validation
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

export class VerifyAccountDto {
  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Registered email to verify.',
    maxLength: 254,
  })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    example: '483920',
    description: 'Exactly 6-digit numeric OTP sent to the registered email.',
    minLength: 6,
    maxLength: 6,
    pattern: '^\\d{6}$',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp!: string;
}
