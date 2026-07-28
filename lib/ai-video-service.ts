import {
  getAiVideoJob,
  getAiVideoMedia,
  type AiVideoJob,
  updateAiVideoJob,
} from "@/db/ai-video";
import { getModelConfig } from "./ai-video-models";

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
    hasVideo: Boolean(job.output_object_key),
    createdAt: job.created_at,
    completedAt: job.completed_at,
  };
}

export async function refreshAiVideoJob(job: AiVideoJob) {
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
    await updateAiVideoJob(job.id, job.user_id, {
      status: "complete",
      progress: 100,
      output_object_key: outputKey,
      output_mime_type: contentType,
      completed_at: completedAt,
      error_message: null,
    });
    return (await getAiVideoJob(job.id, job.user_id)) || job;
  } catch {
    await updateAiVideoJob(job.id, job.user_id, {
      status: "running",
      progress: estimatedProgress(job),
    });
    return (await getAiVideoJob(job.id, job.user_id)) || job;
  }
}
