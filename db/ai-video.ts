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
  last_frame_object_key: string | null;
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
  media_type: "picture" | "video" | "scene";
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
  last_frame_object_key: string | null;
  content_object_key: string | null;
  content_mime_type: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type AiVideoScene = {
  id: string; user_id: string; media_id: string; title: string;
  created_at: string; updated_at: string;
};

export type AiVideoProcessingTask = {
  id: string; user_id: string; task_type: "last_frame" | "scene_export";
  status: "submitted" | "pending" | "complete" | "failed"; progress: number;
  source_media_id: string | null; scene_id: string | null; output_media_id: string | null;
  modal_call_id: string | null; modal_result_path: string | null;
  access_token_hash: string | null; error_message: string | null;
  created_at: string; updated_at: string; completed_at: string | null;
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
        last_frame_object_key TEXT,
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
        last_frame_object_key TEXT,
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
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_video_scenes (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, media_id TEXT NOT NULL,
      title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS ai_video_scenes_media_uq ON ai_video_scenes(media_id)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS ai_video_scenes_user_created_idx ON ai_video_scenes(user_id, created_at)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_video_scene_items (
      id TEXT PRIMARY KEY NOT NULL, scene_id TEXT NOT NULL, user_id TEXT NOT NULL,
      media_id TEXT NOT NULL, position INTEGER NOT NULL, created_at TEXT NOT NULL
    )`),
    db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS ai_video_scene_items_position_uq ON ai_video_scene_items(scene_id, position)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS ai_video_scene_items_media_idx ON ai_video_scene_items(media_id)`),
    db.prepare(`CREATE TABLE IF NOT EXISTS ai_video_processing_tasks (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, task_type TEXT NOT NULL,
      status TEXT DEFAULT 'submitted' NOT NULL, progress INTEGER DEFAULT 0 NOT NULL,
      source_media_id TEXT, scene_id TEXT, output_media_id TEXT, modal_call_id TEXT,
      modal_result_path TEXT, access_token_hash TEXT, error_message TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, completed_at TEXT
    )`),
    db.prepare(`CREATE INDEX IF NOT EXISTS ai_video_processing_user_status_idx ON ai_video_processing_tasks(user_id, status)`),
    db.prepare(`CREATE INDEX IF NOT EXISTS ai_video_processing_scene_idx ON ai_video_processing_tasks(scene_id)`),
    db.prepare(`
      INSERT OR IGNORE INTO ai_video_media (
        id, user_id, media_type, status, model_key, prompt, negative_prompt,
        quality, width, height, duration_seconds, fps, seed, job_id,
        thumbnail_object_key, last_frame_object_key, content_object_key, content_mime_type,
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
        duration_seconds, fps, seed, id, thumbnail_object_key, last_frame_object_key,
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
        source_file_name, source_provider, source_model_key, thumbnail_object_key, last_frame_object_key, output_object_key,
        output_mime_type, error_message, created_at, updated_at, completed_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
      job.last_frame_object_key,
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
      | "last_frame_object_key"
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
        thumbnail_object_key, last_frame_object_key, content_object_key, content_mime_type,
        error_message, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      media.last_frame_object_key,
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
  mediaType?: "picture" | "video" | "scene",
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
    db.prepare("DELETE FROM ai_video_processing_tasks WHERE output_media_id = ? AND user_id = ?").bind(id, userId),
    db.prepare("DELETE FROM ai_video_scene_items WHERE media_id = ? AND user_id = ?").bind(id, userId),
    db.prepare("DELETE FROM ai_video_scene_items WHERE scene_id IN (SELECT id FROM ai_video_scenes WHERE media_id = ? AND user_id = ?)").bind(id, userId),
    db.prepare("DELETE FROM ai_video_processing_tasks WHERE scene_id IN (SELECT id FROM ai_video_scenes WHERE media_id = ? AND user_id = ?)").bind(id, userId),
    db.prepare("DELETE FROM ai_video_scenes WHERE media_id = ? AND user_id = ?").bind(id, userId),
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
      | "last_frame_object_key"
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

export async function getSceneForMedia(mediaId: string, userId: string) {
  return (await getAiVideoDb()).prepare(`
    SELECT s.* FROM ai_video_scenes s
    JOIN ai_video_scene_items i ON i.scene_id = s.id
    WHERE i.media_id = ? AND s.user_id = ? LIMIT 1
  `).bind(mediaId, userId).first<AiVideoScene>();
}

export async function createOrAppendScene(userId: string, sourceMedia: AiVideoMedia, newMediaId: string, requestedSceneId?: string) {
  const db = await getAiVideoDb();
  const now = new Date().toISOString();
  let scene = requestedSceneId
    ? await db.prepare("SELECT * FROM ai_video_scenes WHERE id = ? AND user_id = ?").bind(requestedSceneId, userId).first<AiVideoScene>()
    : await getSceneForMedia(sourceMedia.id, userId);
  if (!scene) {
    const sceneId = crypto.randomUUID();
    const sceneMediaId = crypto.randomUUID();
    const title = `Scene — ${sourceMedia.prompt.slice(0, 64)}`;
    const sceneMedia: AiVideoMedia = {
      id: sceneMediaId, user_id: userId, media_type: "scene", status: "complete",
      model_key: "scene", prompt: title, negative_prompt: null, quality: sourceMedia.quality,
      width: sourceMedia.width, height: sourceMedia.height, duration_seconds: sourceMedia.duration_seconds,
      fps: sourceMedia.fps, seed: sourceMedia.seed, job_id: null, thumbnail_object_key: null,
      last_frame_object_key: null, content_object_key: null, content_mime_type: null,
      error_message: null, created_at: now, updated_at: now, completed_at: now,
    };
    await insertAiVideoMedia(sceneMedia);
    await db.batch([
      db.prepare("INSERT INTO ai_video_scenes(id,user_id,media_id,title,created_at,updated_at) VALUES(?,?,?,?,?,?)").bind(sceneId,userId,sceneMediaId,title,now,now),
      db.prepare("INSERT INTO ai_video_scene_items(id,scene_id,user_id,media_id,position,created_at) VALUES(?,?,?,?,0,?)").bind(crypto.randomUUID(),sceneId,userId,sourceMedia.id,now),
    ]);
    scene = { id: sceneId, user_id: userId, media_id: sceneMediaId, title, created_at: now, updated_at: now };
  }
  const row = await db.prepare("SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ai_video_scene_items WHERE scene_id = ?").bind(scene.id).first<{next:number}>();
  await db.prepare("INSERT INTO ai_video_scene_items(id,scene_id,user_id,media_id,position,created_at) VALUES(?,?,?,?,?,?)")
    .bind(crypto.randomUUID(), scene.id, userId, newMediaId, row?.next ?? 0, now).run();
  await db.prepare("UPDATE ai_video_scenes SET updated_at=? WHERE id=?").bind(now, scene.id).run();
  return scene;
}

export async function getAiVideoScene(id: string, userId: string) {
  const db = await getAiVideoDb();
  const scene = await db.prepare("SELECT * FROM ai_video_scenes WHERE (id=? OR media_id=?) AND user_id=?").bind(id,id,userId).first<AiVideoScene>();
  if (!scene) return null;
  const items = (await db.prepare(`
    SELECT m.* FROM ai_video_scene_items i JOIN ai_video_media m ON m.id=i.media_id
    WHERE i.scene_id=? AND i.user_id=? ORDER BY i.position ASC
  `).bind(scene.id,userId).all<AiVideoMedia>()).results;
  return { scene, items };
}

export async function insertProcessingTask(task: AiVideoProcessingTask) {
  await (await getAiVideoDb()).prepare(`INSERT INTO ai_video_processing_tasks
    (id,user_id,task_type,status,progress,source_media_id,scene_id,output_media_id,modal_call_id,modal_result_path,access_token_hash,error_message,created_at,updated_at,completed_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      task.id,task.user_id,task.task_type,task.status,task.progress,task.source_media_id,
      task.scene_id,task.output_media_id,task.modal_call_id,task.modal_result_path,
      task.access_token_hash,task.error_message,task.created_at,task.updated_at,task.completed_at
    ).run();
}

export async function getProcessingTask(id: string, userId?: string) {
  const db = await getAiVideoDb();
  return userId
    ? db.prepare("SELECT * FROM ai_video_processing_tasks WHERE id=? AND user_id=?").bind(id,userId).first<AiVideoProcessingTask>()
    : db.prepare("SELECT * FROM ai_video_processing_tasks WHERE id=?").bind(id).first<AiVideoProcessingTask>();
}

export async function getPendingTaskForMedia(mediaId: string, type: AiVideoProcessingTask["task_type"]) {
  return (await getAiVideoDb()).prepare(`
    SELECT * FROM ai_video_processing_tasks WHERE output_media_id=? AND task_type=?
    ORDER BY created_at DESC LIMIT 1
  `).bind(mediaId,type).first<AiVideoProcessingTask>();
}

export async function getProcessingTaskForScene(sceneId: string) {
  return (await getAiVideoDb()).prepare(`
    SELECT * FROM ai_video_processing_tasks WHERE scene_id=? AND task_type='scene_export'
    ORDER BY created_at DESC LIMIT 1
  `).bind(sceneId).first<AiVideoProcessingTask>();
}

export async function updateProcessingTask(id: string, updates: Partial<AiVideoProcessingTask>) {
  const entries = Object.entries(updates).filter(([k]) => !["id","user_id","created_at"].includes(k));
  if (!entries.length) return;
  await (await getAiVideoDb()).prepare(`UPDATE ai_video_processing_tasks SET ${entries.map(([k])=>`${k}=?`).join(", ")}, updated_at=? WHERE id=?`)
    .bind(...entries.map(([,v])=>v),new Date().toISOString(),id).run();
}

export async function processingTaskAllowsMedia(taskId: string, mediaId: string) {
  return (await getAiVideoDb()).prepare(`
    SELECT 1 AS allowed FROM ai_video_processing_tasks t
    WHERE t.id=? AND (
      t.source_media_id=? OR t.output_media_id=? OR EXISTS (
        SELECT 1 FROM ai_video_scene_items i
        WHERE i.scene_id=t.scene_id AND i.media_id=? AND i.user_id=t.user_id
      )
    ) LIMIT 1
  `).bind(taskId, mediaId, mediaId, mediaId).first<{allowed:number}>();
}
