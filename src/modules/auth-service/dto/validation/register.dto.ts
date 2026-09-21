/**
 * @fileoverview DTO for user registration.
 *
 * ── Validation strategy ───────────────────────────────────────────────────────
 *
 *  - Standard decorators (@IsString, @IsNotEmpty, @IsEmail, @MinLength,
 *    @IsEnum) rely on class-validator's own default messages.
 *  - @Matches decorators carry explicit, human-readable messages.
 *  - fullName is trimmed and length-bounded (2–100).
 *  - password enforces complexity (upper + lower + digit + special).
 *  - role is validated against the Prisma UserRole enum; ADMIN cannot
 *    self-register (service-layer guard, but DTO constrains the enum surface).
 *
 * @module auth-service/dto/validation
 */
import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Roles that are allowed at registration time. */
const REGISTERABLE_ROLES = [UserRole.HR, UserRole.EMPLOYEE] as const;

export class RegisterDto {
  @ApiProperty({
    example: 'John Doe',
    description: 'Full legal name. 2–100 characters.',
    minLength: 2,
    maxLength: 100,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(100)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string;

  @ApiProperty({
    example: 'john.doe@example.com',
    description: 'Login identifier.',
    maxLength: 254,
  })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  @ApiProperty({
    example: 'Password123!',
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
  password!: string;

  @ApiProperty({
    example: UserRole.EMPLOYEE,
    enum: REGISTERABLE_ROLES,
    description:
      'Account role.',
  })
  @IsEnum(REGISTERABLE_ROLES, {
    message: `role must be one of: ${REGISTERABLE_ROLES.join(', ')}`,
  })
  @IsNotEmpty()
  role!: (typeof REGISTERABLE_ROLES)[number];
}
