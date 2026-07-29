export const FAILED_MEDIA_RETENTION_MS = 24 * 60 * 60 * 1000;

export function failedMediaCleanupCutoff(now = Date.now()) {
  return new Date(now - FAILED_MEDIA_RETENTION_MS).toISOString();
}
