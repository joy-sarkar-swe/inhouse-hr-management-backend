/**
 * @fileoverview User service — thin orchestration layer over UserDAO.
 *
 * This service exposes a clean domain API to auth and other consumers.
 * It does NOT contain query logic — that lives in UserDAO.
 * It does NOT contain auth logic — that lives in AuthService.
 *
 * @module user-service
 */
import { Injectable, Logger } from '@nestjs/common';
import { MediaEntityType } from '@prisma/client';
import { GcpStorageService } from 'src/common/gcp-storage/gcp-storage.service';
import type { GcpUploadResult } from 'src/common/gcp-storage/gcp-storage.types';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import {
  CreateUserData,
  PublicUser,
  UpdateUserData,
  UserDAO,
  UserWithOtp,
  UserWithPassword,
  UserWithPendingOtp,
} from './dao/user.dao';

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
};

function mimeFromPath(storagePath: string): string {
  const ext = storagePath.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? 'application/octet-stream';
}

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    private readonly userDAO: UserDAO,
    private readonly gcsStorageService: GcpStorageService,
    private readonly prisma: PrismaService,
  ) {}

  /** Create a new user record. */
  async create(data: CreateUserData): Promise<PublicUser> {
    return this.userDAO.create(data);
  }

  /** Find user by ID (no password). */
  async findById(id: string): Promise<PublicUser | null> {
    return this.userDAO.findById(id);
  }

  /** Find user by email (no password). */
  async findByEmail(email: string): Promise<PublicUser | null> {
    return this.userDAO.findByEmail(email);
  }

  /** Find user by email WITH password hash — auth only. */
  async findWithPassword(email: string): Promise<UserWithPassword | null> {
    return this.userDAO.findWithPassword(email);
  }

  /** Find user by ID WITH password hash — change-password flow. */
  async findByIdWithPassword(id: string): Promise<UserWithPassword | null> {
    return this.userDAO.findByIdWithPassword(id);
  }

  /** Find user by email WITH OTP fields — forgot-password flow. */
  async findWithOtp(email: string): Promise<UserWithOtp | null> {
    return this.userDAO.findWithOtp(email);
  }

  /** Find user by registration email and verification OTP — verify-account flow. */
  async findByVerificationOtp(
    email: string,
    otp: string,
  ): Promise<UserWithOtp | null> {
    return this.userDAO.findByVerificationOtp(email, otp);
  }

  /** Update arbitrary fields on a user record. */
  async update(id: string, data: UpdateUserData): Promise<PublicUser> {
    return this.userDAO.update(id, data);
  }

  /** Update user profile (name only). */
  async updateProfile(
    id: string,
    data: { name?: string },
  ): Promise<Record<string, unknown>> {
    const updated = await this.userDAO.update(id, data);
    return this.toApiResponse(updated);
  }

  /** Get user profile by ID, with signed avatar URL. */
  async getProfile(id: string): Promise<Record<string, unknown> | null> {
    const user = await this.findById(id);
    if (!user) return null;
    return this.toApiResponse(user);
  }

  /** Find user by ID with pending email OTP fields — change-email flow. */
  async findByIdWithPendingOtp(id: string): Promise<UserWithPendingOtp | null> {
    return this.userDAO.findByIdWithPendingOtp(id);
  }

  /** Commit an email address change atomically. */
  async commitEmailChange(id: string, newEmail: string): Promise<void> {
    return this.userDAO.commitEmailChange(id, newEmail);
  }

  /** Reset password and clear OTP fields atomically. */
  async resetPasswordAndClearOtp(
    id: string,
    newHashedPassword: string,
  ): Promise<void> {
    return this.userDAO.resetPasswordAndClearOtp(id, newHashedPassword);
  }

  /** Mark account verified and clear verification OTP. */
  async markVerifiedAndClearOtp(id: string): Promise<void> {
    return this.userDAO.markVerifiedAndClearOtp(id);
  }

  /** Fast email existence check. */
  async existsByEmail(email: string): Promise<boolean> {
    return this.userDAO.existsByEmail(email);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Transform PublicUser to API response: generate signed avatar URL, exclude internal fields. */
  private async toApiResponse(
    user: PublicUser,
  ): Promise<Record<string, unknown>> {
    const { avatar_public_id, ...safeUser } = user;

    if (!avatar_public_id) {
      return safeUser;
    }

    try {
      const signedUrl =
        await this.gcsStorageService.getSignedUrl(avatar_public_id);
      return { ...safeUser, avatar: signedUrl };
    } catch (err: unknown) {
      this.logger.warn(
        `Failed to generate signed URL for avatar ${avatar_public_id}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return safeUser;
    }
  }

  // ─── Avatar management ────────────────────────────────────────────────────

  /** Upload or replace user avatar. Deletes old avatar if exists. */
  async uploadAvatar(
    userId: string,
    uploadResult: GcpUploadResult,
  ): Promise<{ message: string; data: Record<string, unknown> }> {
    // Find current user to get existing avatar_public_id for cleanup
    const currentUser = await this.findById(userId);
    const oldAvatarPath = currentUser?.avatar_public_id ?? null;

    // Update DB: store only storagePath (not the URL) for secure signed URL generation
    const updated = await this.userDAO.update(userId, {
      avatar: null,
      avatar_public_id: uploadResult.storagePath,
    });

    // Persist Media record (strict rule: all uploads tracked in Media table)
    void this.prisma.media
      .create({
        data: {
          bucket: uploadResult.bucket,
          storage_path: uploadResult.storagePath,
          public_url: uploadResult.publicUrl,
          file_name:
            uploadResult.storagePath.split('/').pop() ??
            uploadResult.storagePath,
          mime_type: mimeFromPath(uploadResult.storagePath),
          size_bytes: BigInt(uploadResult.bytes),
          entity_type: MediaEntityType.USER_AVATAR,
          user_id: userId,
        },
      })
      .catch((err: Error) =>
        this.logger.warn(`Media record failed for avatar: ${err.message}`),
      );

    // Cleanup old avatar GCS file + Media row (fire-and-log, non-blocking)
    if (oldAvatarPath) {
      void this.gcsStorageService
        .deleteByPath(oldAvatarPath)
        .catch((err: Error) =>
          this.logger.warn(
            `Failed to delete old avatar ${oldAvatarPath}: ${err.message}`,
          ),
        );
      void this.prisma.media
        .deleteMany({
          where: { storage_path: oldAvatarPath },
        })
        .catch((err: Error) =>
          this.logger.warn(
            `Failed to delete old Media row for avatar: ${err.message}`,
          ),
        );
    }

    const apiResponse = await this.toApiResponse(updated);
    return { message: 'Avatar uploaded successfully.', data: apiResponse };
  }

  /** Remove user avatar. Deletes GCS file if exists. */
  async removeAvatar(
    userId: string,
  ): Promise<{ message: string; data: Record<string, unknown> }> {
    // Find current user to get avatar_public_id for cleanup
    const currentUser = await this.findById(userId);
    const avatarPath = currentUser?.avatar_public_id ?? null;

    // Clear avatar from DB
    const updated = await this.userDAO.update(userId, {
      avatar: null,
      avatar_public_id: null,
    });

    // Cleanup GCS file + Media row (fire-and-log, non-blocking)
    if (avatarPath) {
      void this.gcsStorageService
        .deleteByPath(avatarPath)
        .catch((err: Error) =>
          this.logger.warn(
            `Failed to delete avatar ${avatarPath}: ${err.message}`,
          ),
        );
      void this.prisma.media
        .deleteMany({
          where: { storage_path: avatarPath },
        })
        .catch((err: Error) =>
          this.logger.warn(
            `Failed to delete Media row for avatar: ${err.message}`,
          ),
        );
    }

    const apiResponse = await this.toApiResponse(updated);
    return { message: 'Avatar removed successfully.', data: apiResponse };
  }
}
