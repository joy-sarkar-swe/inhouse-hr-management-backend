/**
 * @fileoverview Configuration types for the file upload interceptor system.
 * These interfaces define the validation rules and safety thresholds
 * used by the file upload decorators.
 */

/** Image attack-prevention thresholds. */
export interface ImageSafetyOptions {
  /** Max allowed width in pixels. Default: `8192`. */
  maxWidth?: number;
  /** Max allowed height in pixels. Default: `8192`. */
  maxHeight?: number;
  /** Max total pixel count (width × height). Default: `20_000_000` (20 MP). */
  maxPixels?: number;
  /**
   * Max ratio of raw uncompressed pixel data size to actual file size.
   * A very small file claiming huge dimensions signals a decompression bomb.
   * Default: `50`.
   */
  maxDecompressionRatio?: number;
}

/**
 * Where the uploaded image is going — drives the AI moderation audit row.
 * Must mirror `AiImageModerationContext` in the AI service module.
 */
export type ImageModerationContext =
  | 'PRODUCT_IMAGE'
  | 'REVIEW_IMAGE'
  | 'ORDER_REF_IMAGE'
  | 'AVATAR'
  | 'SHOP_LOGO'
  | 'SHOP_BANNER';

/** Opt-in AI image-moderation config for an upload route. */
export interface ImageModerationOptions {
  /**
   * When true, every image buffer is sent to AiImageModerationService BEFORE
   * the GCS upload. Blocked images cause the request to fail with a 409.
   * When false / undefined, no moderation runs (default).
   */
  enabled: boolean;
  /** Surface where the image came from — used for the audit row subject_type. */
  context: ImageModerationContext;
}

/** Options accepted by both single and multi-file upload interceptors. */
export interface FileUploadOptions {
  /** Max file size in bytes. Default: `5 * 1024 * 1024` (5 MB). */
  maxSizeBytes?: number;
  /**
   * Allowed MIME types checked against actual magic bytes — not the file extension.
   * Example: `['image/jpeg', 'image/png', 'application/pdf']`.
   * Leave empty to allow any type (not recommended).
   */
  allowedMimeTypes?: readonly string[];
  /**
   * Image-specific safety options. Applied automatically when the MIME type
   * starts with `image/`.
   */
  image?: ImageSafetyOptions;
  /**
   * Opt-in AI image moderation. When enabled, each image buffer is screened
   * by AiImageModerationService before being uploaded to GCS. Blocked images
   * cause the request to fail with a 409 ConflictException — no GCS pollution.
   */
  imageModeration?: ImageModerationOptions;
}

/**
 * Interface representing an uploaded file, compatible with the Fastify-based system.
 */
export interface UploadedFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
