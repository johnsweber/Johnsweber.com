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
  thumbnail_object_key: string | null;
  output_object_key: string | null;
  output_mime_type: string | null;
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
        source_file_name, thumbnail_object_key, output_object_key,
        output_mime_type, error_message, created_at, updated_at, completed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
