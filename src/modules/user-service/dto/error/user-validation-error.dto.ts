/**
 * @fileoverview Swagger 400 Validation Error DTOs for user-service endpoints.
 *
 * @module user-service/dto/error
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  FieldErrorDto,
  ValidationErrorResponseDto,
} from 'src/common/dto/validation-error.dto';
import { Methods } from 'src/common/enum/methods.enum';

const VALIDATION_MSG_EXAMPLE = 'Validation failed';

// ─── PATCH /profile/me ────────────────────────────────────────────────────────

export class UpdateProfileValidationErrorResponseDto extends ValidationErrorResponseDto {
  @ApiProperty({ example: VALIDATION_MSG_EXAMPLE })
  declare message: string;

  @ApiProperty({ example: Methods.PATCH })
  declare method: Methods;

  @ApiProperty({ example: '/api/v1/profile/me' })
  declare endpoint: string;

  @ApiProperty({
    type: [FieldErrorDto],
    example: [{ field: 'name', message: 'name must be a string' }],
  })
  declare errors: FieldErrorDto[];
}

// ─── POST /profile/me/avatar ──────────────────────────────────────────────────

export class UploadAvatarValidationErrorResponseDto extends ValidationErrorResponseDto {
  @ApiProperty({ example: VALIDATION_MSG_EXAMPLE })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods;

  @ApiProperty({ example: '/api/v1/profile/me/avatar' })
  declare endpoint: string;

  @ApiProperty({
    type: [FieldErrorDto],
    example: [{ field: 'avatar', message: 'avatar file is required' }],
  })
  declare errors: FieldErrorDto[];
}
