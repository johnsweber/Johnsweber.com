export type AiVideoJob = {
  id: string;
  user_id: string;
  model_key: string;
  generation_mode: string;
  prompt: string;
  negative_prompt: string | null;
  status: "queued" | "running" | "complete" | "failed";
  progress: number;
  quality: string;
  duration_seconds: number;
  width: number;
  height: number;
  fps: number;
  seed: number;
  estimated_seconds: number;
  modal_call_id: string | null;
  modal_result_path: string | null;
  source_object_key: string | null;
  source_file_name: string | null;
  source_provider: string;
  source_model_key: string | null;
  thumbnail_object_key: string | null;
  output_object_key: string | null;
  output_mime_type: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AiVideoMedia = {
  id: string;
  user_id: string;
  media_type: "picture" | "video";
  status: "submitted" | "pending" | "complete" | "failed";
  model_key: string;
  prompt: string;
  negative_prompt: string | null;
  quality: string;
  width: number;
  height: number;
  duration_seconds: number | null;
  fps: number | null;
  seed: number;
  job_id: string | null;
  thumbnail_object_key: string | null;
  content_object_key: string | null;
  content_mime_type: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type RuntimeBindings = {
  DB?: D1Database;
  MEDIA?: R2Bucket;
};

async function bindings() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeBindings;
}

export async function getAiVideoDb() {
  const db = (await bindings()).DB;
  if (!db) throw new Error("D1 binding DB is unavailable.");
  return db;
}

export async function getAiVideoMedia() {
  const bucket = (await bindings()).MEDIA;
  if (!bucket) throw new Error("R2 binding MEDIA is unavailable.");
  return bucket;
}

export async function ensureAiVideoSchema() {
  const db = await getAiVideoDb();
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS shared_user_profiles (
        clerk_user_id TEXT PRIMARY KEY NOT NULL,
        display_name TEXT,
        email TEXT,
        avatar_url TEXT,
        last_seen_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS experiment_catalog (
        slug TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        status TEXT DEFAULT 'active' NOT NULL,
        endpoint_namespace TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS experiment_catalog_endpoint_namespace_uq
      ON experiment_catalog (endpoint_namespace)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_video_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        model_key TEXT NOT NULL,
        generation_mode TEXT NOT NULL,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        status TEXT DEFAULT 'queued' NOT NULL,
        progress INTEGER DEFAULT 0 NOT NULL,
        quality TEXT NOT NULL,
        duration_seconds INTEGER NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        fps INTEGER NOT NULL,
        seed INTEGER NOT NULL,
        estimated_seconds INTEGER NOT NULL,
        modal_call_id TEXT,
        modal_result_path TEXT,
        source_object_key TEXT,
        source_file_name TEXT,
        source_provider TEXT DEFAULT 'upload' NOT NULL,
        source_model_key TEXT,
        thumbnail_object_key TEXT,
        output_object_key TEXT,
        output_mime_type TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS ai_video_jobs_user_created_idx
      ON ai_video_jobs (user_id, created_at)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS ai_video_jobs_user_status_idx
      ON ai_video_jobs (user_id, status)
    `),
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_video_jobs_modal_call_uq
      ON ai_video_jobs (modal_call_id)
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS ai_video_media (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        media_type TEXT NOT NULL,
        status TEXT DEFAULT 'submitted' NOT NULL,
        model_key TEXT NOT NULL,
        prompt TEXT NOT NULL,
        negative_prompt TEXT,
        quality TEXT NOT NULL,
        width INTEGER NOT NULL,
        height INTEGER NOT NULL,
        duration_seconds INTEGER,
        fps INTEGER,
        seed INTEGER NOT NULL,
        job_id TEXT,
        thumbnail_object_key TEXT,
        content_object_key TEXT,
        content_mime_type TEXT,
        error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS ai_video_media_user_created_idx
      ON ai_video_media (user_id, created_at)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS ai_video_media_user_type_created_idx
      ON ai_video_media (user_id, media_type, created_at)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS ai_video_media_user_status_idx
      ON ai_video_media (user_id, status)
    `),
    db.prepare(`
      CREATE UNIQUE INDEX IF NOT EXISTS ai_video_media_job_uq
      ON ai_video_media (job_id)
    `),
    db.prepare(`
      INSERT OR IGNORE INTO ai_video_media (
        id, user_id, media_type, status, model_key, prompt, negative_prompt,
        quality, width, height, duration_seconds, fps, seed, job_id,
        thumbnail_object_key, content_object_key, content_mime_type,
        error_message, created_at, updated_at, completed_at
      )
      SELECT
        id, user_id, 'video',
        CASE
          WHEN status = 'complete' THEN 'complete'
          WHEN status = 'failed' THEN 'failed'
          ELSE 'pending'
        END,
        model_key, prompt, negative_prompt, quality, width, height,
        duration_seconds, fps, seed, id, thumbnail_object_key,
        output_object_key, output_mime_type, error_message, created_at,
        updated_at, completed_at
      FROM ai_video_jobs
    `),
  ]);

  const now = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO experiment_catalog
        (slug, name, status, endpoint_namespace, created_at, updated_at)
      VALUES (?, ?, 'active', ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        name = excluded.name,
        status = excluded.status,
        endpoint_namespace = excluded.endpoint_namespace,
        updated_at = excluded.updated_at
    `)
    .bind("ai-video", "AI Video", "/api/experiments/ai-video", now, now)
    .run();
}

export async function upsertSharedUser(
  userId: string,
  profile: { displayName?: string; email?: string; avatarUrl?: string },
) {
  const db = await getAiVideoDb();
  const now = new Date().toISOString();
  await db
    .prepare(`
      INSERT INTO shared_user_profiles
        (clerk_user_id, display_name, email, avatar_url, last_seen_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(clerk_user_id) DO UPDATE SET
        display_name = excluded.display_name,
        email = excluded.email,
        avatar_url = excluded.avatar_url,
        last_seen_at = excluded.last_seen_at,
        updated_at = excluded.updated_at
    `)
    .bind(
      userId,
      profile.displayName || null,
      profile.email || null,
      profile.avatarUrl || null,
      now,
      now,
      now,
    )
    .run();
}

export async function insertAiVideoJob(job: AiVideoJob) {
  await (await getAiVideoDb())
    .prepare(`
      INSERT INTO ai_video_jobs (
        id, user_id, model_key, generation_mode, prompt, negative_prompt,
        status, progress, quality, duration_seconds, width, height, fps, seed,
        estimated_seconds, modal_call_id, modal_result_path, source_object_key,
        source_file_name, source_provider, source_model_key, thumbnail_object_key, output_object_key,
        output_mime_type, error_message, created_at, updated_at, completed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `)
    .bind(
      job.id,
      job.user_id,
      job.model_key,
      job.generation_mode,
      job.prompt,
      job.negative_prompt,
      job.status,
      job.progress,
      job.quality,
      job.duration_seconds,
      job.width,
      job.height,
      job.fps,
      job.seed,
      job.estimated_seconds,
      job.modal_call_id,
      job.modal_result_path,
      job.source_object_key,
      job.source_file_name,
      job.source_provider,
      job.source_model_key,
      job.thumbnail_object_key,
      job.output_object_key,
      job.output_mime_type,
      job.error_message,
      job.created_at,
      job.updated_at,
      job.completed_at,
    )
    .run();
}

export async function listAiVideoJobs(userId: string) {
  const result = await (await getAiVideoDb())
    .prepare(`
      SELECT * FROM ai_video_jobs
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 100
    `)
    .bind(userId)
    .all<AiVideoJob>();
  return result.results;
}

export async function getAiVideoJob(id: string, userId: string) {
  return (await getAiVideoDb())
    .prepare("SELECT * FROM ai_video_jobs WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<AiVideoJob>();
}

export async function updateAiVideoJob(
  id: string,
  userId: string,
  updates: Partial<
    Pick<
      AiVideoJob,
      | "status"
      | "progress"
      | "modal_call_id"
      | "modal_result_path"
      | "output_object_key"
      | "output_mime_type"
      | "error_message"
      | "completed_at"
    >
  >,
) {
  const entries = Object.entries(updates);
  if (!entries.length) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  const values = entries.map(([, value]) => value);
  await (await getAiVideoDb())
    .prepare(
      `UPDATE ai_video_jobs SET ${assignments}, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
    .bind(...values, new Date().toISOString(), id, userId)
    .run();
}

export async function insertAiVideoMedia(media: AiVideoMedia) {
  await (await getAiVideoDb())
    .prepare(`
      INSERT INTO ai_video_media (
        id, user_id, media_type, status, model_key, prompt, negative_prompt,
        quality, width, height, duration_seconds, fps, seed, job_id,
        thumbnail_object_key, content_object_key, content_mime_type,
        error_message, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      media.id,
      media.user_id,
      media.media_type,
      media.status,
      media.model_key,
      media.prompt,
      media.negative_prompt,
      media.quality,
      media.width,
      media.height,
      media.duration_seconds,
      media.fps,
      media.seed,
      media.job_id,
      media.thumbnail_object_key,
      media.content_object_key,
      media.content_mime_type,
      media.error_message,
      media.created_at,
      media.updated_at,
      media.completed_at,
    )
    .run();
}

export async function listAiVideoMedia(
  userId: string,
  mediaType?: "picture" | "video",
) {
  const db = await getAiVideoDb();
  const query = mediaType
    ? db
        .prepare(`
          SELECT * FROM ai_video_media
          WHERE user_id = ? AND media_type = ?
          ORDER BY created_at DESC
          LIMIT 100
        `)
        .bind(userId, mediaType)
    : db
        .prepare(`
          SELECT * FROM ai_video_media
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 100
        `)
        .bind(userId);
  return (await query.all<AiVideoMedia>()).results;
}

export async function getAiVideoMediaItem(id: string, userId: string) {
  return (await getAiVideoDb())
    .prepare("SELECT * FROM ai_video_media WHERE id = ? AND user_id = ?")
    .bind(id, userId)
    .first<AiVideoMedia>();
}

export async function getAiVideoMediaByJob(jobId: string, userId: string) {
  return (await getAiVideoDb())
    .prepare("SELECT * FROM ai_video_media WHERE job_id = ? AND user_id = ?")
    .bind(jobId, userId)
    .first<AiVideoMedia>();
}

export async function deleteAiVideoMediaItem(
  id: string,
  userId: string,
  jobId: string | null,
) {
  const db = await getAiVideoDb();
  const statements = [
    db
      .prepare("DELETE FROM ai_video_media WHERE id = ? AND user_id = ?")
      .bind(id, userId),
  ];
  if (jobId) {
    statements.push(
      db
        .prepare("DELETE FROM ai_video_jobs WHERE id = ? AND user_id = ?")
        .bind(jobId, userId),
    );
  }
  await db.batch(statements);
}

export async function updateAiVideoMedia(
  id: string,
  userId: string,
  updates: Partial<
    Pick<
      AiVideoMedia,
      | "status"
      | "thumbnail_object_key"
      | "content_object_key"
      | "content_mime_type"
      | "error_message"
      | "completed_at"
    >
  >,
) {
  const entries = Object.entries(updates);
  if (!entries.length) return;
  const assignments = entries.map(([key]) => `${key} = ?`).join(", ");
  await (await getAiVideoDb())
    .prepare(
      `UPDATE ai_video_media SET ${assignments}, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
    .bind(
      ...entries.map(([, value]) => value),
      new Date().toISOString(),
      id,
      userId,
    )
    .run();
}
