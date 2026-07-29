ALTER TABLE `ai_video_media` ADD `retain_failed` integer DEFAULT 0 NOT NULL;

CREATE INDEX `ai_video_media_failed_cleanup_idx`
ON `ai_video_media` (`status`, `retain_failed`, `updated_at`);
