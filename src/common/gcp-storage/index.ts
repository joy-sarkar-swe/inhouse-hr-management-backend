/**
 * @fileoverview Barrel — service surface only.
 *
 * Interceptor factories (`GcpStorageFileInterceptor`, `GcpStorageFilesInterceptor`)
 * are NOT re-exported here. Controllers must import them from
 * `'./gcp-storage.interceptors'` directly. This split prevents a circular
 * module load: services like SiteSettingsService import GcpStorageService
 * from this barrel; if the barrel also exported the interceptors (which
 * statically import AiImageModerationService), Node would pull the entire
 * AI service module into the service-load chain → undefined dependencies.
 */
export { GcpStorageModule } from './gcp-storage.module';
export { GcpStorageService } from './gcp-storage.service';
export { UploadedGcpFile, UploadedGcpFiles } from './gcp-storage.decorators';
export {
  GcsFolder,
  IMAGE_UPLOAD_DEFAULTS,
  UPLOAD_LIMITS,
} from './gcp-storage.constants';
export type { GcsFolderType } from './gcp-storage.constants';
export type {
  GcpUploadOptions,
  GcpUploadResult,
  GcpDeleteResult,
  GcpBatchUploadResult,
} from './gcp-storage.types';
