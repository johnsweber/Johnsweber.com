CREATE TABLE `ai_video_reconciler_state` (
	`id` integer PRIMARY KEY NOT NULL,
	`lease_until` text,
	`last_run_at` text,
	`last_success_at` text,
	`last_error` text,
	`jobs_checked` integer DEFAULT 0 NOT NULL,
	`tasks_checked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ai_video_jobs` ADD `provider_last_contact_at` text;--> statement-breakpoint
ALTER TABLE `ai_video_jobs` ADD `retry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_video_media` ADD `stop_gpu_when_queue_complete` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_video_media` ADD `gpu_shutdown_status` text DEFAULT 'not_requested' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_video_media` ADD `gpu_shutdown_message` text;--> statement-breakpoint
ALTER TABLE `ai_video_processing_tasks` ADD `provider_last_contact_at` text;--> statement-breakpoint
ALTER TABLE `ai_video_processing_tasks` ADD `retry_count` integer DEFAULT 0 NOT NULL;