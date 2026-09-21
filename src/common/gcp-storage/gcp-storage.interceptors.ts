/**
 * @fileoverview GCP Cloud Storage upload interceptor factories.
 *
 * After an interceptor runs, the Fastify request carries:
 *   req.uploadedFile            → GcpUploadResult            (single upload)
 *   req.uploadedFiles           → GcpUploadResult[]          (batch upload)
 *   req.uploadedFilesMimeTypes  → string[]                   (MIME types parallel
 *                                                             to uploadedFiles)
 *
 * Every upload runs magic-bytes MIME validation and, for images, decompression-
 * bomb / pixel-flood safety checks before it ever reaches GCS.
 *
 * @module common/gcp-storage
 */
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  PayloadTooLargeException,
  mixin,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Observable } from 'rxjs';
import { FileUploadOptions } from '../file-upload/types/file-upload.types';
import { validateImageSafety } from '../file-upload/utils/image-safety.util';
import { validateMimeType } from '../file-upload/utils/magic-bytes.util';
import type { GcsFolderType } from './gcp-storage.constants';
import { GcpStorageService } from './gcp-storage.service';

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// ─── Single-file interceptor ──────────────────────────────────────────────────

export function GcpStorageFileInterceptor(
  fieldName: string,
  folder: GcsFolderType,
  fileOptions: FileUploadOptions = {},
) {
  @Injectable()
  class Mixin implements NestInterceptor {
    readonly logger = new Logger('GcpStorageFileInterceptor');
    gcp: GcpStorageService;

    constructor(public readonly moduleRef: ModuleRef) {
      this.gcp = this.moduleRef.get(GcpStorageService, { strict: false });
    }

    async intercept(
      ctx: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const req = ctx.switchToHttp().getRequest<any>();
      const maxSize = fileOptions.maxSizeBytes ?? DEFAULT_MAX_SIZE;

      if (!req.isMultipart()) {
        throw new BadRequestException('Request must be multipart/form-data.');
      }

      try {
        const part = await req.file({ limits: { fileSize: maxSize } });

        if (!part || part.type !== 'file' || part.fieldname !== fieldName) {
          throw new BadRequestException(`Field "${fieldName}" is required.`);
        }

        const buffer: Buffer = await part.toBuffer();

        if (buffer.length > maxSize) {
          throw new PayloadTooLargeException(
            `File exceeds ${(maxSize / 1024 / 1024).toFixed(1)} MB limit.`,
          );
        }

        // Magic-bytes MIME validation
        if (fileOptions.allowedMimeTypes?.length) {
          validateMimeType(
            { buffer, mimetype: part.mimetype },
            fileOptions.allowedMimeTypes,
          );
        }
        // Image safety (pixel flood / decompression bomb)
        if (part.mimetype.startsWith('image/')) {
          validateImageSafety(buffer, buffer.length, fileOptions.image ?? {});
        }

        const result = await this.gcp.uploadFile(buffer, {
          folder,
          mimeType: part.mimetype,
        });

        this.logger.log(`GCS single upload: path=${result.storagePath}`);
        req.uploadedFile = result;
        req.uploadedFileMimeType = part.mimetype;
      } catch (err: unknown) {
        // Fastify Multipart: Must consume the stream or it will hang.
        // We use resume() to drain the stream without closing the socket,
        // allowing the error response to be sent.
        if (req.raw?.resume) {
          req.raw.resume();
        }

        this.logger.error(
          `GCS single upload error: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        if (
          err instanceof BadRequestException ||
          err instanceof PayloadTooLargeException ||
          err instanceof ConflictException
        ) {
          throw err;
        }
        throw new BadRequestException(
          err instanceof Error ? err.message : 'File upload failed.',
        );
      }

      return next.handle();
    }
  }

  return mixin(Mixin);
}

// ─── Multi-file interceptor ───────────────────────────────────────────────────

export function GcpStorageFilesInterceptor(
  fieldName: string,
  folder: GcsFolderType,
  maxFiles: number,
  fileOptions: FileUploadOptions = {},
) {
  @Injectable()
  class Mixin implements NestInterceptor {
    readonly logger = new Logger('GcpStorageFilesInterceptor');
    gcp: GcpStorageService;

    constructor(public readonly moduleRef: ModuleRef) {
      this.gcp = this.moduleRef.get(GcpStorageService, { strict: false });
    }

    async intercept(
      ctx: ExecutionContext,
      next: CallHandler,
    ): Promise<Observable<unknown>> {
      const req = ctx.switchToHttp().getRequest<any>();
      const maxSize = fileOptions.maxSizeBytes ?? DEFAULT_MAX_SIZE;

      if (!req.isMultipart()) {
        throw new BadRequestException('Request must be multipart/form-data.');
      }

      const items: Array<{ buffer: Buffer; mimeType: string }> = [];

      try {
        const parts = req.files({
          limits: { fileSize: maxSize, files: maxFiles },
        });

        for await (const part of parts) {
          if (part.type !== 'file' || part.fieldname !== fieldName) continue;

          if (items.length >= maxFiles) {
            throw new BadRequestException(
              `Too many files. Maximum: ${maxFiles}.`,
            );
          }

          const buffer: Buffer = await part.toBuffer();

          if (buffer.length > maxSize) {
            throw new PayloadTooLargeException(
              `File exceeds ${(maxSize / 1024 / 1024).toFixed(1)} MB limit.`,
            );
          }

          if (fileOptions.allowedMimeTypes?.length) {
            validateMimeType(
              { buffer, mimetype: part.mimetype },
              fileOptions.allowedMimeTypes,
            );
          }
          if (part.mimetype.startsWith('image/')) {
            validateImageSafety(buffer, buffer.length, fileOptions.image ?? {});
          }

          items.push({ buffer, mimeType: part.mimetype });
        }

        // No files uploaded is valid (e.g. update without new images)
        if (!items.length) {
          this.logger.debug(`No files found for field "${fieldName}"`);
          req.uploadedFiles = [];
          req.uploadedFilesMimeTypes = [];
          return next.handle();
        }

        const batchResult = await this.gcp.uploadFiles(items, { folder });

        if (batchResult.failed.length) {
          const firstError = batchResult.failed[0].error;
          this.logger.error(
            `GCS batch upload failed: ${batchResult.succeeded.length} succeeded, ${batchResult.failed.length} failed. First error: ${firstError}`,
          );
          throw new BadRequestException(`File upload failed: ${firstError}`);
        }

        req.uploadedFiles = batchResult.succeeded;
        // Build MIME types array parallel to succeeded results.
        // batchResult.succeeded preserves original order for fulfilled items.
        const succeededIndexes = batchResult.succeeded.map((_, i) => i);
        req.uploadedFilesMimeTypes = succeededIndexes.map(
          (i) => items[i]?.mimeType ?? 'application/octet-stream',
        );
      } catch (err: unknown) {
        // Fastify Multipart: Must consume the stream or it will hang.
        // We use resume() to drain the stream without closing the socket,
        // allowing the error response to be sent.
        if (req.raw?.resume) {
          req.raw.resume();
        }

        this.logger.error(
          `GCS batch upload error: ${err instanceof Error ? err.message : String(err)}`,
          err instanceof Error ? err.stack : undefined,
        );
        if (
          err instanceof BadRequestException ||
          err instanceof PayloadTooLargeException ||
          err instanceof ConflictException
        ) {
          throw err;
        }
        throw new BadRequestException(
          err instanceof Error ? err.message : 'File upload failed.',
        );
      }

      return next.handle();
    }
  }

  return mixin(Mixin);
}
