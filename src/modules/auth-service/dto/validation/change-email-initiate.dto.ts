/**
 * @fileoverview DTO for initiating an email address change (step 1 of 2).
 *
 * The authenticated user supplies the new email they want to switch to.
 * An OTP will be sent to that new address to confirm ownership.
 *
 * @module auth-service/dto/validation
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, MaxLength } from 'class-validator';

export class ChangeEmailInitiateDto {
  @ApiProperty({
    example: 'newemail@example.com',
    description:
      'New email address to switch to. A verification OTP will be sent to this address.',
    maxLength: 254,
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  newEmail!: string;
}
