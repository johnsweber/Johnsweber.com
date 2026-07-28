CREATE TABLE `ai_video_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`model_key` text NOT NULL,
	`generation_mode` text NOT NULL,
	`prompt` text NOT NULL,
	`negative_prompt` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`quality` text NOT NULL,
	`duration_seconds` integer NOT NULL,
	`width` integer NOT NULL,
	`height` integer NOT NULL,
	`fps` integer NOT NULL,
	`seed` integer NOT NULL,
	`estimated_seconds` integer NOT NULL,
	`modal_call_id` text,
	`modal_result_path` text,
	`source_object_key` text,
	`source_file_name` text,
	`thumbnail_object_key` text,
	`output_object_key` text,
	`output_mime_type` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_video_jobs_user_created_idx` ON `ai_video_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `ai_video_jobs_user_status_idx` ON `ai_video_jobs` (`user_id`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_video_jobs_modal_call_uq` ON `ai_video_jobs` (`modal_call_id`);--> statement-breakpoint
CREATE TABLE `experiment_catalog` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`endpoint_namespace` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `experiment_catalog_endpoint_namespace_uq` ON `experiment_catalog` (`endpoint_namespace`);--> statement-breakpoint
CREATE TABLE `shared_user_profiles` (
	`clerk_user_id` text PRIMARY KEY NOT NULL,
	`display_name` text,
	`email` text,
	`avatar_url` text,
	`last_seen_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shared_user_profiles_email_idx` ON `shared_user_profiles` (`email`);