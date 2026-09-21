/**
 * @fileoverview User controller — profile management endpoints.
 *
 * Routes:
 *  GET    /v1/profile/me        — Get current user profile (any role)
 *  PATCH  /v1/profile/me        — Update user name (any role)
 *  POST   /v1/profile/me/avatar — Upload or replace profile avatar
 *  DELETE /v1/profile/me/avatar — Remove profile avatar
 *
 * @module user-service
 */
import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorResponses } from 'src/common/decorators/api-error-response.decorator';
import { ApiSuccessResponse } from 'src/common/decorators/api-success-response.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { GcpStorageFileInterceptor } from 'src/common/gcp-storage/gcp-storage.interceptors';
import { UploadedGcpFile } from 'src/common/gcp-storage';
import type { GcpUploadResult } from 'src/common/gcp-storage';
import {
  GcsFolder,
  IMAGE_UPLOAD_DEFAULTS,
  UPLOAD_LIMITS,
} from 'src/common/gcp-storage/gcp-storage.constants';
import { AuthenticatedUserThrottleGuard } from 'src/common/throttles/user/authenticated-user-throttle.guard';
import {
  ProfileAvatarThrottleGuard,
  ProfileWriteThrottleGuard,
} from 'src/common/throttles/profile/profile-throttle.guard';
import config from 'src/shared/config/app.config';
import type { AuthUser } from 'src/shared/interfaces/auth-user.interface';
import { JwtAuthGuard } from '../auth-service/guards/jwt-auth.guard';

const THROTTLE_ENABLED = config.THROTTLE_ENABLED;
import {
  GetProfileUnauthorizedResponseDto,
  RemoveAvatarUnauthorizedResponseDto,
  UpdateProfileUnauthorizedResponseDto,
  UploadAvatarPayloadTooLargeResponseDto,
  UploadAvatarUnauthorizedResponseDto,
  UploadAvatarUnsupportedMediaTypeResponseDto,
} from './dto/error/user-error.dto';
import {
  UpdateProfileValidationErrorResponseDto,
  UploadAvatarValidationErrorResponseDto,
} from './dto/error/user-validation-error.dto';
import {
  GetProfileSuccessDto,
  RemoveAvatarSuccessDto,
  UpdateProfileSuccessDto,
  UploadAvatarSuccessDto,
} from './dto/success/user-success.dto';
import { UpdateProfileDto } from './dto/validation/user.dto';
import { UserService } from './user.service';

@ApiTags('Profile')
@ApiBearerAuth('Authorization')
@UseGuards(
  JwtAuthGuard,
  ...(THROTTLE_ENABLED ? [AuthenticatedUserThrottleGuard] : []),
)
@Controller({ path: 'profile', version: '1' })
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * Return the authenticated user's own profile (any role).
   *
   * The response includes a signed GCS avatar URL (valid 15 min) when the
   * user has an avatar stored. If avatar signing fails the field is omitted
   * gracefully rather than returning an error.
   *
   * Throttled by:
   *  - Authenticated userId (primary)
   *  - Global authenticated-user rolling window (secondary)
   */
  @Get('me')
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiSuccessResponse(GetProfileSuccessDto, 200)
  @ApiErrorResponses({ unauthorized: GetProfileUnauthorizedResponseDto })
  async getProfile(
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string; data: any }> {
    const profile = await this.userService.getProfile(user.id!);
    return {
      message: 'Profile retrieved successfully.',
      data: profile,
    };
  }

  /**
   * Update the authenticated user's display name (any role).
   *
   * Only the `name` field is mutable via this endpoint. Email and password
   * changes each have dedicated auth endpoints with OTP verification.
   *
   * Throttled by:
   *  - Authenticated userId (primary)
   *  - Profile-write rolling window (secondary)
   */
  @Patch('me')
  @UseGuards(...(THROTTLE_ENABLED ? [ProfileWriteThrottleGuard] : []))
  @ApiOperation({ summary: 'Update user profile' })
  @ApiSuccessResponse(UpdateProfileSuccessDto, 200)
  @ApiErrorResponses({
    validation: UpdateProfileValidationErrorResponseDto,
    unauthorized: UpdateProfileUnauthorizedResponseDto,
  })
  async updateProfile(
    @CurrentUser() user: AuthUser,
    @Body(ValidationPipe) dto: UpdateProfileDto,
  ): Promise<{ message: string; data: any }> {
    const updated = await this.userService.updateProfile(user.id!, {
      name: dto.name,
    });
    return {
      message: 'Profile updated successfully.',
      data: updated,
    };
  }

  /**
   * Upload or replace the authenticated user's profile avatar (any role).
   *
   * Accepts `multipart/form-data` with field `avatar` (jpeg/png/webp, max 3 MB).
   * The old GCS file is deleted automatically on replacement. A Media record
   * is always created for full upload provenance. The response contains a
   * signed avatar URL valid for 15 minutes.
   *
   * Throttled by:
   *  - Authenticated userId (primary)
   *  - Profile-avatar rolling window (secondary — stricter than profile-write)
   */
  @Post('me/avatar')
  @UseGuards(...(THROTTLE_ENABLED ? [ProfileAvatarThrottleGuard] : []))
  @UseInterceptors(
    GcpStorageFileInterceptor('avatar', GcsFolder.USER_AVATAR, {
      maxSizeBytes: UPLOAD_LIMITS.USER_AVATAR.MAX_SIZE_BYTES,
      allowedMimeTypes: IMAGE_UPLOAD_DEFAULTS.ALLOWED_MIME_TYPES,
      image: { maxPixels: IMAGE_UPLOAD_DEFAULTS.MAX_PIXELS },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { avatar: { type: 'string', format: 'binary' } },
      required: ['avatar'],
    },
  })
  @ApiOperation({ summary: 'Upload or replace profile avatar' })
  @ApiSuccessResponse(UploadAvatarSuccessDto, 201)
  @ApiErrorResponses({
    validation: UploadAvatarValidationErrorResponseDto,
    unauthorized: UploadAvatarUnauthorizedResponseDto,
    payloadTooLarge: UploadAvatarPayloadTooLargeResponseDto,
    unsupported: UploadAvatarUnsupportedMediaTypeResponseDto,
  })
  async uploadAvatar(
    @UploadedGcpFile() uploadResult: GcpUploadResult,
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string; data: any }> {
    return this.userService.uploadAvatar(user.id!, uploadResult);
  }

  /**
   * Remove the authenticated user's profile avatar (any role).
   *
   * Deletes the GCS file and the corresponding Media record, then clears
   * `avatar_public_id` on the user row. The GCS deletion is fire-and-log
   * (non-blocking) so the endpoint returns quickly even if GCS is slow.
   * After removal the `avatar` field in profile responses returns `null`.
   *
   * Throttled by:
   *  - Authenticated userId (primary)
   *  - Profile-avatar rolling window (secondary)
   */
  @Delete('me/avatar')
  @UseGuards(...(THROTTLE_ENABLED ? [ProfileAvatarThrottleGuard] : []))
  @ApiOperation({ summary: 'Remove profile avatar' })
  @ApiSuccessResponse(RemoveAvatarSuccessDto, 200)
  @ApiErrorResponses({ unauthorized: RemoveAvatarUnauthorizedResponseDto })
  async removeAvatar(
    @CurrentUser() user: AuthUser,
  ): Promise<{ message: string; data: any }> {
    return this.userService.removeAvatar(user.id!);
  }
}
