import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Shared identity metadata is deliberately kept separate from experiment data.
// Clerk remains the source of truth for authentication and account security.
export const sharedUserProfiles = sqliteTable(
  "shared_user_profiles",
  {
    clerkUserId: text("clerk_user_id").primaryKey(),
    displayName: text("display_name"),
    email: text("email"),
    avatarUrl: text("avatar_url"),
    lastSeenAt: text("last_seen_at").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("shared_user_profiles_email_idx").on(table.email)],
);

export const experimentCatalog = sqliteTable(
  "experiment_catalog",
  {
    slug: text("slug").primaryKey(),
    name: text("name").notNull(),
    status: text("status").notNull().default("active"),
    endpointNamespace: text("endpoint_namespace").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("experiment_catalog_endpoint_namespace_uq").on(
      table.endpointNamespace,
    ),
  ],
);

// AI Video owns this table and the /api/experiments/ai-video endpoint namespace.
// Future experiments should receive their own tables rather than sharing this one.
export const aiVideoJobs = sqliteTable(
  "ai_video_jobs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    modelKey: text("model_key").notNull(),
    generationMode: text("generation_mode").notNull(),
    prompt: text("prompt").notNull(),
    negativePrompt: text("negative_prompt"),
    status: text("status").notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    quality: text("quality").notNull(),
    durationSeconds: integer("duration_seconds").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    fps: integer("fps").notNull(),
    seed: integer("seed").notNull(),
    estimatedSeconds: integer("estimated_seconds").notNull(),
    modalCallId: text("modal_call_id"),
    modalResultPath: text("modal_result_path"),
    sourceObjectKey: text("source_object_key"),
    sourceFileName: text("source_file_name"),
    sourceProvider: text("source_provider").notNull().default("upload"),
    sourceModelKey: text("source_model_key"),
    thumbnailObjectKey: text("thumbnail_object_key"),
    lastFrameObjectKey: text("last_frame_object_key"),
    outputObjectKey: text("output_object_key"),
    outputMimeType: text("output_mime_type"),
    errorMessage: text("error_message"),
    providerLastContactAt: text("provider_last_contact_at"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("ai_video_jobs_user_created_idx").on(table.userId, table.createdAt),
    index("ai_video_jobs_user_status_idx").on(table.userId, table.status),
    uniqueIndex("ai_video_jobs_modal_call_uq").on(table.modalCallId),
  ],
);

// Unified, user-owned library for every asset created inside the AI Video
// experiment. Provider-specific execution details stay in their own job tables.
export const aiVideoMedia = sqliteTable(
  "ai_video_media",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    mediaType: text("media_type").notNull(),
    status: text("status").notNull().default("submitted"),
    modelKey: text("model_key").notNull(),
    prompt: text("prompt").notNull(),
    negativePrompt: text("negative_prompt"),
    quality: text("quality").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    durationSeconds: integer("duration_seconds"),
    fps: integer("fps"),
    seed: integer("seed").notNull(),
    jobId: text("job_id"),
    thumbnailObjectKey: text("thumbnail_object_key"),
    lastFrameObjectKey: text("last_frame_object_key"),
    contentObjectKey: text("content_object_key"),
    contentMimeType: text("content_mime_type"),
    errorMessage: text("error_message"),
    stopGpuWhenQueueComplete: integer("stop_gpu_when_queue_complete", {
      mode: "boolean",
    }).notNull().default(false),
    gpuShutdownStatus: text("gpu_shutdown_status").notNull().default("not_requested"),
    gpuShutdownMessage: text("gpu_shutdown_message"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("ai_video_media_user_created_idx").on(table.userId, table.createdAt),
    index("ai_video_media_user_type_created_idx").on(
      table.userId,
      table.mediaType,
      table.createdAt,
    ),
    index("ai_video_media_user_status_idx").on(table.userId, table.status),
    uniqueIndex("ai_video_media_job_uq").on(table.jobId),
  ],
);

export const aiVideoScenes = sqliteTable(
  "ai_video_scenes",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    mediaId: text("media_id").notNull(),
    title: text("title").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("ai_video_scenes_user_created_idx").on(table.userId, table.createdAt),
    uniqueIndex("ai_video_scenes_media_uq").on(table.mediaId),
  ],
);

export const aiVideoSceneItems = sqliteTable(
  "ai_video_scene_items",
  {
    id: text("id").primaryKey(),
    sceneId: text("scene_id").notNull(),
    userId: text("user_id").notNull(),
    mediaId: text("media_id").notNull(),
    position: integer("position").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("ai_video_scene_items_position_uq").on(table.sceneId, table.position),
    index("ai_video_scene_items_media_idx").on(table.mediaId),
  ],
);

export const aiVideoProcessingTasks = sqliteTable(
  "ai_video_processing_tasks",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    taskType: text("task_type").notNull(),
    status: text("status").notNull().default("submitted"),
    progress: integer("progress").notNull().default(0),
    sourceMediaId: text("source_media_id"),
    sceneId: text("scene_id"),
    outputMediaId: text("output_media_id"),
    modalCallId: text("modal_call_id"),
    modalResultPath: text("modal_result_path"),
    accessTokenHash: text("access_token_hash"),
    errorMessage: text("error_message"),
    providerLastContactAt: text("provider_last_contact_at"),
    retryCount: integer("retry_count").notNull().default(0),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    completedAt: text("completed_at"),
  },
  (table) => [
    index("ai_video_processing_user_status_idx").on(table.userId, table.status),
    index("ai_video_processing_scene_idx").on(table.sceneId),
  ],
);

export const aiVideoReconcilerState = sqliteTable("ai_video_reconciler_state", {
  id: integer("id").primaryKey(),
  leaseUntil: text("lease_until"),
  lastRunAt: text("last_run_at"),
  lastSuccessAt: text("last_success_at"),
  lastError: text("last_error"),
  jobsChecked: integer("jobs_checked").notNull().default(0),
  tasksChecked: integer("tasks_checked").notNull().default(0),
});
