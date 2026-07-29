ALTER TABLE `ai_video_jobs` ADD `source_provider` text DEFAULT 'upload' NOT NULL;--> statement-breakpoint
ALTER TABLE `ai_video_jobs` ADD `source_model_key` text;