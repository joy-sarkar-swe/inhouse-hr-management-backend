/**
 * @fileoverview Barrel module for file-upload validation utilities.
 * Single entry point for the magic-bytes MIME check and image-safety check
 * used by the GCS upload interceptors.
 *
 * @example
 * ```ts
 * import type { FileUploadOptions } from 'src/common/file-upload';
 * ```
 */
export { validateMimeType } from './utils/magic-bytes.util';
export { validateImageSafety } from './utils/image-safety.util';
export type {
  FileUploadOptions,
  ImageSafetyOptions,
} from './types/file-upload.types';
