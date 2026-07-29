CREATE TABLE `ai_video_media` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_type` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`model_key` text NOT NULL,
	`prompt` text NOT NULL,
	`negative_prompt` text,
	`quality` text NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`duration_seconds` integer,
	`fps` integer,
	`seed` integer NOT NULL,
	`job_id` text,
	`thumbnail_object_key` text,
	`content_object_key` text,
	`content_mime_type` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_video_media_user_created_idx` ON `ai_video_media` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_video_media_user_type_created_idx` ON `ai_video_media` (`user_id`,`media_type`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_video_media_user_status_idx` ON `ai_video_media` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_video_media_job_uq` ON `ai_video_media` (`job_id`);--> statement-breakpoint
INSERT OR IGNORE INTO `ai_video_media` (
	`id`, `user_id`, `media_type`, `status`, `model_key`, `prompt`,
	`negative_prompt`, `quality`, `width`, `height`, `duration_seconds`,
	`fps`, `seed`, `job_id`, `thumbnail_object_key`, `content_object_key`,
	`content_mime_type`, `error_message`, `created_at`, `updated_at`,
	`completed_at`
)
SELECT
	`id`, `user_id`, 'video',
	CASE
		WHEN `status` = 'complete' THEN 'complete'
		WHEN `status` = 'failed' THEN 'failed'
		ELSE 'pending'
	END,
	`model_key`, `prompt`, `negative_prompt`, `quality`, `width`, `height`,
	`duration_seconds`, `fps`, `seed`, `id`, `thumbnail_object_key`,
	`output_object_key`, `output_mime_type`, `error_message`, `created_at`,
	`updated_at`, `completed_at`
FROM `ai_video_jobs`;
