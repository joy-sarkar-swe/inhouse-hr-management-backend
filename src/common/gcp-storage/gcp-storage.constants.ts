/**
 * @fileoverview GCP Cloud Storage upload types and constants.
 *
 * @module common/gcp-storage/types
 */

// ─── Folder constants ─────────────────────────────────────────────────────────

/**
 * Named folder prefixes in GCS.
 * Each domain gets its own top-level prefix for organisation.
 *
 * GCS object path: <GCS_FOLDER_PREFIX>/<uuid>.<ext>
 *
 * Add a new entry here (and a matching `UPLOAD_LIMITS` entry below) for any
 * new upload context.
 */
export const GcsFolder = {
  USER_AVATAR: 'users/avatars',
} as const;

export type GcsFolderType = (typeof GcsFolder)[keyof typeof GcsFolder];

// ─── Image upload constraints ─────────────────────────────────────────────────

/** Default constraints applied to all image uploads. */
export const IMAGE_UPLOAD_DEFAULTS = {
  MAX_SIZE_BYTES: 10 * 1024 * 1024,
  ALLOWED_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  MAX_PIXELS: 30_000_000,
} as const;

/** Per-context upload limits. */
export const UPLOAD_LIMITS = {
  USER_AVATAR: {
    MAX_SIZE_BYTES: 3 * 1024 * 1024,
    MAX_FILES: 1,
  },
} as const;
