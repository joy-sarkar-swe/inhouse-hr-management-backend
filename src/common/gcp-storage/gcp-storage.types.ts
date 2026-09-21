/**
 * @fileoverview Type definitions for the GCP Cloud Storage service.
 * @module common/gcp-storage
 */

/** Options for a single-file upload to GCS. */
export interface GcpUploadOptions {
  /** Destination folder prefix inside the bucket, e.g. "shops/logos". */
  folder: string;
  /** Optional explicit file name (without extension). UUID used when omitted. */
  fileName?: string;
  /** MIME type of the file, e.g. "image/webp". */
  mimeType?: string;
  /** Optional image quality hint stored in metadata (not processed by GCS). */
  quality?: number;
}

/** Result returned after a successful GCS upload. */
export interface GcpUploadResult {
  /** GCS object name, e.g. "shops/logos/uuid.webp". Used for deletion. */
  storagePath: string;
  /** Full HTTPS public URL of the uploaded object. */
  publicUrl: string;
  /** Bucket the object was uploaded to. */
  bucket: string;
  /** Approximate size in bytes. */
  bytes: number;
}

/** Result of a GCS delete operation. */
export interface GcpDeleteResult {
  deleted: boolean;
  /** GCS-level result string or error message. */
  result: string;
}

/** Per-item result inside a batch upload response. */
export interface GcpBatchUploadResult {
  succeeded: GcpUploadResult[];
  failed: Array<{ index: number; error: string }>;
}
