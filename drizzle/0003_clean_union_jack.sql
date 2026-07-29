CREATE TABLE `ai_video_processing_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`task_type` text NOT NULL,
	`status` text DEFAULT 'submitted' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`source_media_id` text,
	`scene_id` text,
	`output_media_id` text,
	`modal_call_id` text,
	`modal_result_path` text,
	`access_token_hash` text,
	`error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `ai_video_processing_user_status_idx` ON `ai_video_processing_tasks` (`user_id`,`status`);--> statement-breakpoint
CREATE INDEX `ai_video_processing_scene_idx` ON `ai_video_processing_tasks` (`scene_id`);--> statement-breakpoint
CREATE TABLE `ai_video_scene_items` (
	`id` text PRIMARY KEY NOT NULL,
	`scene_id` text NOT NULL,
	`user_id` text NOT NULL,
	`media_id` text NOT NULL,
	`position` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ai_video_scene_items_position_uq` ON `ai_video_scene_items` (`scene_id`,`position`);--> statement-breakpoint
CREATE INDEX `ai_video_scene_items_media_idx` ON `ai_video_scene_items` (`media_id`);--> statement-breakpoint
CREATE TABLE `ai_video_scenes` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`media_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ai_video_scenes_user_created_idx` ON `ai_video_scenes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ai_video_scenes_media_uq` ON `ai_video_scenes` (`media_id`);--> statement-breakpoint
ALTER TABLE `ai_video_jobs` ADD `last_frame_object_key` text;--> statement-breakpoint
ALTER TABLE `ai_video_media` ADD `last_frame_object_key` text;