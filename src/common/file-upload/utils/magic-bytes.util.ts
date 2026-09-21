/**
 * @fileoverview Magic-bytes utility for content-type validation.
 *
 * Validates that a file's actual binary content matches its declared MIME type.
 * This prevents MIME-spoofing attacks where a malicious file is renamed
 * (e.g., a script saved as `.jpg`).
 */
import { UnsupportedMediaTypeException } from '@nestjs/common';

/**
 * Known MIME type → magic byte signatures (first N bytes of the file).
 * Each entry provides an array of valid byte sequences that identify the format.
 */
const MIME_SIGNATURES: Record<string, Buffer[]> = {
  'image/jpeg': [Buffer.from([0xff, 0xd8, 0xff])],
  'image/png': [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
  'image/gif': [Buffer.from('GIF87a'), Buffer.from('GIF89a')],
  'image/bmp': [Buffer.from([0x42, 0x4d])],
  'image/tiff': [
    Buffer.from([0x49, 0x49, 0x2a, 0x00]), // little-endian
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a]), // big-endian
  ],
  // WebP: starts with RIFF, then 4 bytes of size, then WEBP
  'image/webp': [Buffer.from('RIFF')],
  'application/pdf': [Buffer.from('%PDF')],
  'application/zip': [Buffer.from([0x50, 0x4b, 0x03, 0x04])],
  'application/gzip': [Buffer.from([0x1f, 0x8b])],
  'video/mp4': [Buffer.from([0x66, 0x74, 0x79, 0x70])], // 'ftyp' at offset 4
  'video/webm': [Buffer.from([0x1a, 0x45, 0xdf, 0xa3])],
  'audio/mpeg': [Buffer.from([0xff, 0xfb]), Buffer.from('ID3')],
  'text/plain': [], // no magic bytes — skip
};

/**
 * Returns `true` if the file buffer starts with one of the known signatures
 * for the given MIME type.
 *
 * @param buffer - File buffer (only the first ~16 bytes are read).
 * @param mimeType - Declared MIME type to validate against.
 */
function matchesMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const signatures = MIME_SIGNATURES[mimeType];
  if (!signatures) return true; // unknown type — skip check

  // text/plain has no magic bytes; allow it
  if (signatures.length === 0) return true;

  // Special case: video/mp4 — 'ftyp' appears at byte offset 4
  if (mimeType === 'video/mp4') {
    return buffer.slice(4, 8).equals(Buffer.from('ftyp'));
  }

  // Special case: image/webp — 'WEBP' appears at byte offset 8
  if (mimeType === 'image/webp') {
    return (
      buffer.slice(0, 4).equals(Buffer.from('RIFF')) &&
      buffer.slice(8, 12).equals(Buffer.from('WEBP'))
    );
  }

  return signatures.some((sig) => buffer.slice(0, sig.length).equals(sig));
}

/**
 * Validates the actual content type of an uploaded file against magic bytes.
 *
 * @param file - Uploaded file object (containing buffer and mimetype).
 * @param allowedMimeTypes - Accepted MIME types. If empty the check is skipped.
 * @throws {UnsupportedMediaTypeException} when content does not match declared type.
 */
export function validateMimeType(
  file: { buffer: Buffer; mimetype: string },
  allowedMimeTypes: readonly string[],
): void {
  if (!allowedMimeTypes || allowedMimeTypes.length === 0) return;

  const declared = file.mimetype.toLowerCase();

  // 1 — Declared type must be in the allow-list
  if (!allowedMimeTypes.includes(declared)) {
    throw new UnsupportedMediaTypeException(
      `File type "${declared}" is not allowed. Allowed: ${allowedMimeTypes.join(', ')}.`,
    );
  }

  // 2 — Actual bytes must match the declared type
  if (!matchesMagicBytes(file.buffer, declared)) {
    throw new UnsupportedMediaTypeException(
      `File content does not match its declared type "${declared}". ` +
        `Possible MIME-spoofing attempt.`,
    );
  }
}
