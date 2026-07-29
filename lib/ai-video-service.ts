import {
  getAiVideoJob,
  getAiVideoMedia,
  getAiVideoMediaByJob,
  getAiVideoMediaItem,
  getPendingTaskForMedia,
  insertProcessingTask,
  type AiVideoMedia,
  type AiVideoJob,
  updateAiVideoMedia,
  updateAiVideoJob,
} from "@/db/ai-video";
import { getModelConfig } from "./ai-video-models";
import {
  processingEndpoint,
  processingHeaders,
  refreshProcessingTask,
  sha256,
} from "./ai-video-processing";

function modalEndpoint(modelKey: string) {
  const model = getModelConfig(modelKey);
  if (!model) return null;
  return process.env[model.endpointEnv]?.replace(/\/$/, "") || null;
}

function modalHeaders() {
  const key = process.env.MODAL_PROXY_TOKEN_ID;
  const secret = process.env.MODAL_PROXY_TOKEN_SECRET;
  if (!key || !secret) return null;
  return { "Modal-Key": key, "Modal-Secret": secret };
}

function estimatedProgress(job: AiVideoJob) {
  if (job.status === "complete") return 100;
  if (job.status === "failed") return job.progress;
  const elapsed = Math.max(0, Date.now() - Date.parse(job.created_at)) / 1000;
  return Math.max(job.progress, Math.min(92, Math.round((elapsed / job.estimated_seconds) * 88 + 4)));
}

export function publicAiVideoJob(job: AiVideoJob) {
  return {
    id: job.id,
    modelKey: job.model_key,
    generationMode: job.generation_mode,
    prompt: job.prompt,
    status: job.status,
    progress: estimatedProgress(job),
    quality: job.quality,
    durationSeconds: job.duration_seconds,
    width: job.width,
    height: job.height,
    fps: job.fps,
    seed: job.seed,
    estimatedSeconds: job.estimated_seconds,
    errorMessage: job.error_message,
    hasThumbnail: Boolean(job.thumbnail_object_key),
    hasLastFrame: Boolean(job.last_frame_object_key),
    hasVideo: Boolean(job.output_object_key),
    createdAt: job.created_at,
    completedAt: job.completed_at,
  };
}

export function publicAiVideoMedia(media: AiVideoMedia) {
  return {
    id: media.id,
    mediaType: media.media_type,
    status: media.status,
    modelKey: media.model_key,
    prompt: media.prompt,
    quality: media.quality,
    width: media.width,
    height: media.height,
    durationSeconds: media.duration_seconds,
    fps: media.fps,
    seed: media.seed,
    jobId: media.job_id,
    hasThumbnail: Boolean(media.thumbnail_object_key),
    hasLastFrame: Boolean(media.last_frame_object_key),
    hasContent: Boolean(media.content_object_key),
    errorMessage: media.error_message,
    createdAt: media.created_at,
    completedAt: media.completed_at,
  };
}

export async function refreshAiVideoJob(job: AiVideoJob, origin?: string) {
  if (job.output_object_key && job.status !== "complete" && job.status !== "failed") {
    const media = await getAiVideoMediaByJob(job.id, job.user_id);
    const task = media ? await getPendingTaskForMedia(media.id, "last_frame") : null;
    if (task && task.status !== "complete" && task.status !== "failed") {
      await refreshProcessingTask(task);
      return (await getAiVideoJob(job.id, job.user_id)) || job;
    }
  }
  if (
    job.status === "complete" ||
    job.status === "failed" ||
    !job.modal_result_path
  ) {
    return job;
  }

  const endpoint = modalEndpoint(job.model_key);
  const headers = modalHeaders();
  if (!endpoint || !headers) return job;

  try {
    const resultResponse = await fetch(`${endpoint}${job.modal_result_path}`, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });

    if (resultResponse.status === 202) {
      await updateAiVideoJob(job.id, job.user_id, {
        status: "running",
        progress: estimatedProgress(job),
      });
      return (await getAiVideoJob(job.id, job.user_id)) || job;
    }

    if (!resultResponse.ok) {
      const message =
        resultResponse.status === 404
          ? "The generation result expired before it could be saved."
          : "The video service could not complete this generation.";
      await updateAiVideoJob(job.id, job.user_id, {
        status: "failed",
        error_message: message,
      });
      const media = await getAiVideoMediaByJob(job.id, job.user_id);
      if (media) {
        await updateAiVideoMedia(media.id, job.user_id, {
          status: "failed",
          error_message: message,
        });
      }
      return (await getAiVideoJob(job.id, job.user_id)) || job;
    }

    const result = (await resultResponse.json()) as {
      status?: string;
      download_path?: string;
    };
    if (result.status !== "complete" || !result.download_path) return job;

    const videoResponse = await fetch(`${endpoint}${result.download_path}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!videoResponse.ok || !videoResponse.body) {
      throw new Error("Generated video could not be downloaded.");
    }

    const outputKey = `experiments/ai-video/users/${job.user_id}/videos/${job.id}.mp4`;
    const contentType =
      videoResponse.headers.get("content-type") || "video/mp4";
    await (await getAiVideoMedia()).put(outputKey, videoResponse.body, {
      httpMetadata: { contentType },
    });

    const completedAt = new Date().toISOString();
    const media = await getAiVideoMediaByJob(job.id, job.user_id);
    const processingService = processingEndpoint();
    const processingAuth = processingHeaders();
    if (media && processingService && processingAuth && origin) {
      const token = crypto.randomUUID() + crypto.randomUUID();
      const taskId = crypto.randomUUID();
      const task = {
        id: taskId, user_id: job.user_id, task_type: "last_frame" as const,
        status: "submitted" as const, progress: 5, source_media_id: media.id,
        scene_id: null, output_media_id: media.id, modal_call_id: null,
        modal_result_path: null, access_token_hash: await sha256(token),
        error_message: null, created_at: completedAt, updated_at: completedAt, completed_at: null,
      };
      await insertProcessingTask(task);
      const response = await fetch(`${processingService}/last-frame`, {
        method: "POST", headers: processingAuth,
        body: JSON.stringify({
          source_url: `${origin}/api/experiments/ai-video/processing/${taskId}/source/${media.id}`,
          access_token: token,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await response.json().catch(() => ({})) as { call_id?: string; result_path?: string };
      if (response.ok && data.call_id && data.result_path) {
        await (await import("@/db/ai-video")).updateProcessingTask(taskId, {
          status: "pending", progress: 10, modal_call_id: data.call_id, modal_result_path: data.result_path,
        });
        await updateAiVideoJob(job.id, job.user_id, {
          status: "running", progress: 96, output_object_key: outputKey,
          output_mime_type: contentType, error_message: null,
        });
        await updateAiVideoMedia(media.id, job.user_id, {
          status: "pending", content_object_key: outputKey, content_mime_type: contentType, error_message: null,
        });
        return (await getAiVideoJob(job.id, job.user_id)) || job;
      }
    }
    await updateAiVideoJob(job.id, job.user_id, {
      status: "complete",
      progress: 100,
      output_object_key: outputKey,
      output_mime_type: contentType,
      completed_at: completedAt,
      error_message: null,
    });
    if (media) {
      await updateAiVideoMedia(media.id, job.user_id, {
        status: "complete",
        content_object_key: outputKey,
        content_mime_type: contentType,
        error_message: null,
        completed_at: completedAt,
      });
    }
    return (await getAiVideoJob(job.id, job.user_id)) || job;
  } catch {
    await updateAiVideoJob(job.id, job.user_id, {
      status: "running",
      progress: estimatedProgress(job),
    });
    return (await getAiVideoJob(job.id, job.user_id)) || job;
  }
}

export async function refreshAiVideoMediaItem(media: AiVideoMedia, origin?: string) {
  if (
    media.media_type !== "video" ||
    !media.job_id ||
    media.status === "complete" ||
    media.status === "failed"
  ) {
    return media;
  }
  const postTask = await getPendingTaskForMedia(media.id, "last_frame");
  if (postTask && postTask.status !== "complete" && postTask.status !== "failed") {
    await refreshProcessingTask(postTask);
    return (await getAiVideoMediaItem(media.id, media.user_id)) || media;
  }
  const job = await getAiVideoJob(media.job_id, media.user_id);
  if (!job) return media;
  await refreshAiVideoJob(job, origin);
  return (
    (await getAiVideoMediaItem(media.id, media.user_id)) || media
  );
}
