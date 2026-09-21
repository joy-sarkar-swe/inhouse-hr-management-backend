/**
 * @fileoverview Swagger success-response DTOs for user-service profile endpoints.
 *
 * @module user-service/dto/success
 */
import { ApiProperty } from '@nestjs/swagger';
import { SuccessResponseDto } from 'src/common/dto/success-response.dto';
import { Methods } from 'src/common/enum/methods.enum';

// ─── Reusable user profile data shape ─────────────────────────────────────────

export class UserProfileDataDto {
  @ApiProperty({
    example: '550e8400-e29b-41d4-a716-446655440000',
    description: 'User UUID',
  })
  id!: string;

  @ApiProperty({ example: 'John Doe', description: 'User display name' })
  name!: string;

  @ApiProperty({
    example: 'john@example.com',
    description: 'User email address',
    nullable: true,
  })
  email!: string | null;

  @ApiProperty({
    example: 'https://example.com/avatar.jpg',
    description: 'Avatar signed URL (15 min TTL)',
    nullable: true,
  })
  avatar!: string | null;

  @ApiProperty({
    example: 'CUSTOMER',
    enum: ['CUSTOMER', 'SHOP_OWNER', 'ADMIN'],
    description: 'User role',
  })
  role!: string;

  @ApiProperty({ example: false, description: 'Whether account is suspended' })
  is_suspended!: boolean;

  @ApiProperty({
    example: true,
    description: 'Whether account email is verified',
  })
  acc_verified!: boolean;

  @ApiProperty({
    example: '2026-01-15T10:30:00.000Z',
    description: 'Account creation timestamp (ISO 8601)',
  })
  created_at!: Date;

  @ApiProperty({
    example: '2026-02-20T14:45:00.000Z',
    description: 'Account last update timestamp (ISO 8601)',
  })
  updated_at!: Date;
}

// ─── Shared example ───────────────────────────────────────────────────────────

const USER_PROFILE_EXAMPLE = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'John Doe',
  email: 'john@example.com',
  avatar: 'https://example.com/avatar.jpg',
  role: 'CUSTOMER',
  is_suspended: false,
  acc_verified: true,
  created_at: '2026-01-15T10:30:00.000Z',
  updated_at: '2026-02-20T14:45:00.000Z',
} as const;

// ─── GET /profile/me ──────────────────────────────────────────────────────────

export class GetProfileSuccessDto extends SuccessResponseDto<UserProfileDataDto> {
  @ApiProperty({ example: 'Profile retrieved successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.GET, enum: Methods })
  declare method: Methods.GET;

  @ApiProperty({ example: '/api/v1/profile/me' })
  declare endpoint: string;

  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({ type: UserProfileDataDto, example: USER_PROFILE_EXAMPLE })
  declare data: UserProfileDataDto;
}

// ─── PATCH /profile/me ────────────────────────────────────────────────────────

export class UpdateProfileSuccessDto extends SuccessResponseDto<UserProfileDataDto> {
  @ApiProperty({ example: 'Profile updated successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.PATCH, enum: Methods })
  declare method: Methods.PATCH;

  @ApiProperty({ example: '/api/v1/profile/me' })
  declare endpoint: string;

  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({ type: UserProfileDataDto, example: USER_PROFILE_EXAMPLE })
  declare data: UserProfileDataDto;
}

// ─── POST /profile/me/avatar ──────────────────────────────────────────────────

export class UploadAvatarSuccessDto extends SuccessResponseDto<UserProfileDataDto> {
  @ApiProperty({ example: 'Avatar uploaded successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.POST, enum: Methods })
  declare method: Methods.POST;

  @ApiProperty({ example: '/api/v1/profile/me/avatar' })
  declare endpoint: string;

  @ApiProperty({ example: 201 })
  declare statusCode: number;

  @ApiProperty({ type: UserProfileDataDto, example: USER_PROFILE_EXAMPLE })
  declare data: UserProfileDataDto;
}

// ─── DELETE /profile/me/avatar ────────────────────────────────────────────────

export class RemoveAvatarSuccessDto extends SuccessResponseDto<UserProfileDataDto> {
  @ApiProperty({ example: 'Avatar removed successfully.' })
  declare message: string;

  @ApiProperty({ example: Methods.DELETE, enum: Methods })
  declare method: Methods.DELETE;

  @ApiProperty({ example: '/api/v1/profile/me/avatar' })
  declare endpoint: string;

  @ApiProperty({ example: 200 })
  declare statusCode: number;

  @ApiProperty({
    type: UserProfileDataDto,
    example: { ...USER_PROFILE_EXAMPLE, avatar: null },
  })
  declare data: UserProfileDataDto;
}
