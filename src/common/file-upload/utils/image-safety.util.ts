/**
 * @fileoverview Image safety utility.
 *
 * Prevents three image-based attack vectors by inspecting only the image header
 * (via `image-size` — no full decompression occurs):
 *
 * 1. **Pixel Flood Attack** — Image with extreme width or height.
 * 2. **Image Bomb**         — Extreme total pixel count (width × height).
 * 3. **Decompression Bomb** — Tiny file that would expand to gigabytes of raw pixel data.
 */
import { BadRequestException } from '@nestjs/common';
import sizeOf from 'image-size';
import { ImageSafetyOptions } from '../types/file-upload.types';

/**
 * Conservative defaults that block all known attack patterns.
 * These values are used if no custom thresholds are provided.
 */
const DEFAULTS = {
  maxWidth: 8_192, // 8K horizontal
  maxHeight: 8_192, // 8K vertical
  maxPixels: 20_000_000, // 20 megapixels
  maxDecompressionRatio: 50, // raw size / file size > 50 = suspicious
} as const;

/**
 * Validates an image file buffer against pixel flood, image bomb,
 * and decompression bomb attack vectors.
 *
 * @param buffer   - File buffer (already in memory from multer).
 * @param fileSize - Actual byte length of the file.
 * @param options  - Optional custom thresholds; falls back to safe defaults.
 *
 * @throws {BadRequestException} for any detected attack pattern.
 */
export function validateImageSafety(
  buffer: Buffer,
  fileSize: number,
  options: ImageSafetyOptions = {},
): void {
  const maxWidth = options.maxWidth ?? DEFAULTS.maxWidth;
  const maxHeight = options.maxHeight ?? DEFAULTS.maxHeight;
  const maxPixels = options.maxPixels ?? DEFAULTS.maxPixels;
  const maxRatio =
    options.maxDecompressionRatio ?? DEFAULTS.maxDecompressionRatio;

  let dimensions: { width?: number; height?: number };

  try {
    // image-size reads only the image header — it never decodes pixel data.
    dimensions = sizeOf(buffer);
  } catch {
    // Unrecognised or corrupt image format — reject it.
    throw new BadRequestException(
      'Unable to read image dimensions. The file may be corrupt or malformed.',
    );
  }

  const { width, height } = dimensions;

  if (!width || !height) {
    throw new BadRequestException('Image dimensions could not be determined.');
  }

  // ── 1. Pixel Flood Attack ────────────────────────────────────────────────
  if (width > maxWidth) {
    throw new BadRequestException(
      `Image width ${width}px exceeds the maximum allowed ${maxWidth}px (Pixel Flood Attack prevented).`,
    );
  }
  if (height > maxHeight) {
    throw new BadRequestException(
      `Image height ${height}px exceeds the maximum allowed ${maxHeight}px (Pixel Flood Attack prevented).`,
    );
  }

  // ── 2. Image Bomb ────────────────────────────────────────────────────────
  const totalPixels = width * height;
  if (totalPixels > maxPixels) {
    throw new BadRequestException(
      `Image has ${totalPixels.toLocaleString()} total pixels, ` +
        `exceeding the limit of ${maxPixels.toLocaleString()} (Image Bomb prevented).`,
    );
  }

  // ── 3. Decompression Bomb ────────────────────────────────────────────────
  // Raw RGBA pixel data = width × height × 4 bytes (4 channels)
  const estimatedRawBytes = totalPixels * 4;
  const decompressionRatio = estimatedRawBytes / fileSize;

  if (decompressionRatio > maxRatio) {
    throw new BadRequestException(
      `Image has a suspicious compression ratio of ${decompressionRatio.toFixed(1)}× ` +
        `(max allowed: ${maxRatio}×). Decompression Bomb prevented.`,
    );
  }
}
