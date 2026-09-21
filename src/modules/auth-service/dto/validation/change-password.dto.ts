/**
 * @fileoverview DTO for changing an authenticated user's password.
 *
 * Both oldPassword and newPassword are required. The new password must
 * satisfy the complexity policy (upper + lower + digit + special char).
 * Max length is bounded (128) to prevent bcrypt DoS via oversized inputs.
 *
 * @module auth-service/dto/validation
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    example: 'OldPassword123!',
    description: 'Current account password.',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  oldPassword!: string;

  @ApiProperty({
    example: 'NewPassword123!',
    description:
      'New password. Min 8 characters. Must contain at least one uppercase ' +
      'letter, one lowercase letter, one digit, and one special character.',
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
