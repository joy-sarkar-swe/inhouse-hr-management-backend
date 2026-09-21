/**
 * @fileoverview Param decorators for extracting GCS upload results
 * from the request object after GcpStorage interceptors run.
 *
 * Usage:
 *   @UploadedGcpFile()  → GcpUploadResult   (single upload)
 *   @UploadedGcpFiles() → GcpUploadResult[] (batch upload)
 *
 * @module common/gcp-storage
 */
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Extracts the single `GcpUploadResult` attached by
 * `GcpStorageFileInterceptor` to `request.uploadedFile`.
 */
export const UploadedGcpFile = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.uploadedFile ?? null;
  },
);

/**
 * Extracts the `GcpUploadResult[]` attached by
 * `GcpStorageFilesInterceptor` to `request.uploadedFiles`.
 */
export const UploadedGcpFiles = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest();
    return req.uploadedFiles ?? [];
  },
);
