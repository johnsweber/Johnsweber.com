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
    outputObjectKey: text("output_object_key"),
    outputMimeType: text("output_mime_type"),
    errorMessage: text("error_message"),
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
