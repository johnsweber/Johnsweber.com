ALTER TABLE `ai_video_jobs` ADD `generation_metric_id` text;

CREATE TABLE `ai_video_generation_metrics` (
  `id` text PRIMARY KEY NOT NULL,
  `media_type` text NOT NULL,
  `model_key` text NOT NULL,
  `provider` text NOT NULL,
  `settings_json` text NOT NULL,
  `cold_start_used` integer NOT NULL,
  `outcome` text DEFAULT 'pending' NOT NULL,
  `render_seconds` real,
  `started_at` text NOT NULL,
  `completed_at` text
);

CREATE INDEX `ai_video_generation_metrics_estimate_idx`
ON `ai_video_generation_metrics`
  (`media_type`, `model_key`, `outcome`, `cold_start_used`, `completed_at`);
