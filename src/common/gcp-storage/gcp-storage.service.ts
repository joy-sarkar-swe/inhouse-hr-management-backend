/**
 * @fileoverview GcpStorageService — production-grade file upload / delete
 * service backed by Google Cloud Storage (GCS).
 *
 * Responsibilities:
 *  - Upload a single file buffer to a GCS bucket
 *  - Upload multiple file buffers in parallel (per-item error isolation)
 *  - Delete a single object by storage path
 *  - Delete multiple objects in parallel
 *  - Replace an existing object: upload new → delete old
 *  - Generate Signed URLs (V4) for temporary authenticated file access
 *    so public users cannot permanently embed the files
 *
 * ── Signed URL policy ────────────────────────────────────────────────────────
 *
 * ALL file-read URLs returned to API consumers must be Signed URLs with a
 * short TTL (default 15 minutes). This prevents external users from hotlinking
 * or permanently using uploaded images in their own applications / websites.
 *
 * The bucket objects should have uniform bucket-level access (no public ACLs).
 * Only the signed URL mechanism provides time-bounded read access.
 *
 * @module common/gcp-storage
 */
import {
  Injectable,
  Logger,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { Storage } from '@google-cloud/storage';
import { v4 as uuidv4 } from 'uuid';
import config from 'src/shared/config/app.config';
import {
  CircuitBreakerFactory,
  ManagedCircuitBreaker,
} from 'src/common/resilience';
import { SignedUrlCacheService } from './signed-url-cache.service';
import type {
  GcpBatchUploadResult,
  GcpDeleteResult,
  GcpUploadOptions,
  GcpUploadResult,
} from './gcp-storage.types';

// ─── SDK bootstrap ────────────────────────────────────────────────────────────

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Derive extension from MIME type. Falls back to 'bin'. */
function extFromMime(mimeType?: string): string {
  if (!mimeType) return 'bin';
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'application/pdf': 'pdf',
  };
  return map[mimeType] ?? mimeType.split('/')[1] ?? 'bin';
}

/** Stream a buffer to GCS and resolve when finished. */
async function uploadBufferToGcs(
  storage: Storage,
  buffer: Buffer,
  bucket: string,
  storagePath: string,
  mimeType = 'application/octet-stream',
): Promise<{ bytes: number }> {
  return new Promise((resolve, reject) => {
    const file = storage.bucket(bucket).file(storagePath);
    const stream = file.createWriteStream({
      resumable: false,
      contentType: mimeType,
      metadata: { cacheControl: 'private, no-store' }, // no public caching — force signed URL
    });

    stream.on('error', reject);
    stream.on('finish', () => resolve({ bytes: buffer.length }));
    stream.end(buffer);
  });
}

// ─── Service ──────────────────────────────────────────────────────────────────

/** Default signed URL expiry: 15 minutes. */
const DEFAULT_SIGNED_URL_TTL_SECONDS = 15 * 60;

@Injectable()
export class GcpStorageService implements OnModuleInit {
  private readonly logger = new Logger(GcpStorageService.name);
  private readonly storage: Storage;
  readonly bucket: string;

  /**
   * Circuit breaker over GCS sign / upload / delete calls. A degraded GCS
   * region or stale credentials can otherwise stall every public listing
   * request — once tripped, the breaker fast-fails sign calls and lets the
   * caller fall back to an empty `images[]` (no broken pages).
   */
  private breaker!: ManagedCircuitBreaker;

  constructor(
    private readonly breakerFactory: CircuitBreakerFactory,
    private readonly signedUrlCache: SignedUrlCacheService,
  ) {
    this.storage = this.createStorageClient();
    this.bucket = config.GCP_BUCKET_NAME;
  }

  onModuleInit(): void {
    this.breaker = this.breakerFactory.create({
      name: 'gcp-storage',
      // Sign calls are short; bound the breaker timeout aggressively so a stuck
      // call cannot pin a request thread for longer than the user will wait.
      timeout: 5_000,
    });
  }

  private createStorageClient(): Storage {
    const serviceAccountJson = config.GCP_SERVICE_ACCOUNT_JSON;

    if (serviceAccountJson) {
      try {
        const credentials = JSON.parse(serviceAccountJson) as Record<
          string,
          unknown
        >;
        this.logger.log(
          `GCS client initialized with service account JSON. Project: ${String(credentials.project_id)}`,
        );
        return new Storage({ credentials, projectId: config.GCP_PROJECT_ID });
      } catch (err: unknown) {
        this.logger.error(
          `Failed to parse GCP_SERVICE_ACCOUNT_JSON: ${err instanceof Error ? err.message : String(err)}`,
        );
        // Fall through to ADC if JSON is malformed
      }
    }

    this.logger.warn(
      'GCS client falling back to Application Default Credentials (ADC)',
    );
    return new Storage({ projectId: config.GCP_PROJECT_ID });
  }

  // ─── Signed URL ─────────────────────────────────────────────────────────

  /**
   * Generate a V4 Signed URL for a GCS object.
   *
   * Signed URLs grant time-bounded read access to a private GCS object.
   * They expire after `ttlSeconds` (default 15 minutes) and prevent external
   * users from permanently embedding the file in their own applications.
   *
   * @param storagePath  - GCS object name (e.g. "products/images/uuid.webp").
   * @param ttlSeconds   - URL validity window in seconds. Default: 900 (15 min).
   * @param bucketName   - Optional bucket override.
   * @returns            Signed URL string.
   */
  async getSignedUrl(
    storagePath: string,
    ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
    bucketName?: string,
  ): Promise<string> {
    const targetBucket = bucketName ?? this.bucket;

    // Read-through cache: at most one fresh GCS sign call per bucket+path per
    // (ttlSeconds - safety margin), even under concurrent listing requests.
    return this.signedUrlCache.getOrSet(
      targetBucket,
      storagePath,
      ttlSeconds,
      () =>
        this.breaker.fire(async () => {
          const file = this.storage.bucket(targetBucket).file(storagePath);
          const [url] = await file.getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + ttlSeconds * 1000,
          });
          return url;
        }),
    );
  }

  /**
   * Generate Signed URLs for multiple GCS objects in parallel.
   *
   * Objects that fail to sign are returned as null with a warning logged —
   * they never throw so a partial failure does not abort the whole batch.
   *
   * @param paths       - Array of storage paths.
   * @param ttlSeconds  - URL validity window. Default: 900 (15 min).
   * @param bucketName  - Optional bucket override.
   * @returns           Array of signed URLs (null for failures).
   */
  async getSignedUrls(
    paths: string[],
    ttlSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
    bucketName?: string,
  ): Promise<Array<string | null>> {
    return Promise.all(
      paths.map(async (p) => {
        try {
          return await this.getSignedUrl(p, ttlSeconds, bucketName);
        } catch (err: unknown) {
          this.logger.warn(
            `Signed URL generation failed for path=${p}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return null;
        }
      }),
    );
  }

  // ─── Single Upload ──────────────────────────────────────────────────────

  /**
   * Upload a single file buffer to GCS.
   *
   * @param buffer  - In-memory file buffer (from upload interceptor).
   * @param options - Folder prefix, optional file name, MIME type.
   * @returns       Upload result — storagePath is the key for deletion/signing.
   *
   * @throws {BadRequestException} when GCS rejects the upload.
   */
  async uploadFile(
    buffer: Buffer,
    options: GcpUploadOptions,
  ): Promise<GcpUploadResult> {
    const ext = extFromMime(options.mimeType);
    const fileName = options.fileName ?? uuidv4();
    const storagePath = `${options.folder}/${fileName}.${ext}`;

    try {
      const { bytes } = await uploadBufferToGcs(
        this.storage,
        buffer,
        this.bucket,
        storagePath,
        options.mimeType,
      );

      this.logger.log(
        `GCS upload: path=${storagePath} bucket=${this.bucket} bytes=${bytes}`,
      );

      return {
        storagePath,
        // publicUrl is NOT exposed from GCS for private buckets;
        // callers should use getSignedUrl() before serving to clients.
        publicUrl: `gs://${this.bucket}/${storagePath}`,
        bucket: this.bucket,
        bytes,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'GCS upload failed.';
      this.logger.error(`GCS upload error: ${message}`);
      throw new BadRequestException(`File upload failed: ${message}`);
    }
  }

  // ─── Batch Upload ───────────────────────────────────────────────────────

  /**
   * Upload multiple file buffers in parallel with per-item error isolation.
   *
   * @param buffers - Array of { buffer, mimeType } items.
   * @param options - Shared upload options.
   * @returns       Batch result with succeeded and failed items.
   */
  async uploadFiles(
    buffers: Array<{ buffer: Buffer; mimeType?: string }>,
    options: GcpUploadOptions,
  ): Promise<GcpBatchUploadResult> {
    const results = await Promise.allSettled(
      buffers.map((item) =>
        this.uploadFile(item.buffer, { ...options, mimeType: item.mimeType }),
      ),
    );

    const succeeded: GcpUploadResult[] = [];
    const failed: Array<{ index: number; error: string }> = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        succeeded.push(result.value);
      } else {
        const error =
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason);
        failed.push({ index, error });
        this.logger.warn(`GCS batch item ${index} failed: ${error}`);
      }
    });

    return { succeeded, failed };
  }

  // ─── Delete Single ──────────────────────────────────────────────────────

  /**
   * Delete a single GCS object by its storage path.
   *
   * Never throws — failures are logged as warnings.
   *
   * @param storagePath - GCS object name stored in the DB.
   * @param bucketName  - Optional bucket override.
   */
  async deleteByPath(
    storagePath: string,
    bucketName?: string,
  ): Promise<GcpDeleteResult> {
    const targetBucket = bucketName ?? this.bucket;
    try {
      await this.storage.bucket(targetBucket).file(storagePath).delete();
      // Invalidate cache so a stale signed URL doesn't keep getting served
      // until the cache entry expires naturally.
      await this.signedUrlCache.invalidate(targetBucket, storagePath);
      this.logger.log(`GCS delete: path=${storagePath} bucket=${targetBucket}`);
      return { deleted: true, result: 'ok' };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'GCS delete failed.';
      this.logger.warn(
        `GCS delete warning: path=${storagePath} bucket=${targetBucket} — ${message}`,
      );
      return { deleted: false, result: message };
    }
  }

  // ─── Delete Many ────────────────────────────────────────────────────────

  /**
   * Delete multiple GCS objects in parallel.
   * Individual failures are logged but never throw.
   *
   * @param paths - Array of { storagePath, bucket? }.
   */
  async deleteManyByPath(
    paths: Array<{ storagePath: string; bucket?: string }>,
  ): Promise<void> {
    if (!paths.length) return;
    await Promise.allSettled(
      paths.map((p) => this.deleteByPath(p.storagePath, p.bucket)),
    );
  }

  // ─── Replace ────────────────────────────────────────────────────────────

  /**
   * Replace an existing GCS object atomically:
   *  1. Upload new buffer (failure leaves old intact).
   *  2. Delete old object (failure is logged — not fatal).
   *
   * @param newBuffer       - New file buffer.
   * @param oldStoragePath  - storagePath of the object being replaced.
   * @param uploadOptions   - Options for the new upload.
   * @param oldBucket       - Optional bucket override for old object.
   * @returns               New upload result.
   */
  async replaceFile(
    newBuffer: Buffer,
    oldStoragePath: string,
    uploadOptions: GcpUploadOptions,
    oldBucket?: string,
  ): Promise<GcpUploadResult> {
    const newResult = await this.uploadFile(newBuffer, uploadOptions);

    if (oldStoragePath) {
      const deleteResult = await this.deleteByPath(oldStoragePath, oldBucket);
      if (!deleteResult.deleted) {
        this.logger.warn(
          `Old GCS object not deleted: old=${oldStoragePath} new=${newResult.storagePath}`,
        );
      }
    }

    return newResult;
  }
}
