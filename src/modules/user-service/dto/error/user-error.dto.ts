/**
 * @fileoverview Swagger error-response DTOs (401, 413, 415) for user-service.
 *
 * Each endpoint gets a dedicated subclass with realistic, endpoint-specific
 * examples so Swagger renders accurate "Try it out" schemas per route.
 *
 * @module user-service/dto/error
 */
import { ApiProperty } from '@nestjs/swagger';
import { CustomUnauthorizedDto } from 'src/common/dto/custom-unauthorized.dto';
import { CustomUnsupportedMediaTypeDto } from 'src/common/dto/custom-unsupported-media-type.dto';
import { Methods } from 'src/common/enum/methods.enum';
import { FileUploadPayloadTooLargeDto } from 'src/common/file-upload/dto/error/file-upload-validation-error.dto';

const UNAUTHORIZED_MSG_EXAMPLE = 'Session expired or invalid token';

// ─── GET /profile/me ──────────────────────────────────────────────────────────

export class GetProfileUnauthorizedResponseDto extends CustomUnauthorizedDto {
  @ApiProperty({ example: UNAUTHORIZED_MSG_EXAMPLE })
  declare message: string;

  @ApiProperty({ example: Methods.GET })
  declare method: Methods;

  @ApiProperty({ example: '/api/v1/profile/me' })
  declare endpoint: string;
}

// ─── PATCH /profile/me ────────────────────────────────────────────────────────

export class UpdateProfileUnauthorizedResponseDto extends CustomUnauthorizedDto {
  @ApiProperty({ example: UNAUTHORIZED_MSG_EXAMPLE })
  declare message: string;

  @ApiProperty({ example: Methods.PATCH })
  declare method: Methods;

  @ApiProperty({ example: '/api/v1/profile/me' })
  declare endpoint: string;
}

// ─── POST /profile/me/avatar ──────────────────────────────────────────────────

export class UploadAvatarUnauthorizedResponseDto extends CustomUnauthorizedDto {
  @ApiProperty({ example: UNAUTHORIZED_MSG_EXAMPLE })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods;

  @ApiProperty({ example: '/api/v1/profile/me/avatar' })
  declare endpoint: string;
}

export class UploadAvatarPayloadTooLargeResponseDto extends FileUploadPayloadTooLargeDto {
  @ApiProperty({ example: 'File size exceeds the maximum allowed limit.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods;

  @ApiProperty({ example: '/api/v1/profile/me/avatar' })
  declare endpoint: string;
}

export class UploadAvatarUnsupportedMediaTypeResponseDto extends CustomUnsupportedMediaTypeDto {
  @ApiProperty({
    example:
      'Unsupported file type. Allowed: image/jpeg, image/png, image/webp.',
  })
  declare message: string;

  @ApiProperty({ example: Methods.POST })
  declare method: Methods;

  @ApiProperty({ example: '/api/v1/profile/me/avatar' })
  declare endpoint: string;
}

// ─── DELETE /profile/me/avatar ────────────────────────────────────────────────

export class RemoveAvatarUnauthorizedResponseDto extends CustomUnauthorizedDto {
  @ApiProperty({ example: UNAUTHORIZED_MSG_EXAMPLE })
  declare message: string;

  @ApiProperty({ example: Methods.DELETE })
  declare method: Methods;

  @ApiProperty({ example: '/api/v1/profile/me/avatar' })
  declare endpoint: string;
}
