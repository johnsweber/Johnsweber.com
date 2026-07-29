import {
  completeGenerationMetric,
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
  updateProcessingTask,
} from "@/db/ai-video";
import { getModelConfig } from "./ai-video-models";
import {
  processingEndpoint,
  processingHeaders,
  refreshProcessingTask,
  sha256,
} from "./ai-video-processing";
import {
  nextRetryState,
  providerResponseDisposition,
} from "./ai-video-reconcile-policy.mjs";

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

function providerErrorMessage(value: unknown, fallback: string) {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return fallback;
  const record = value as Record<string, unknown>;
  for (const key of ["detail", "error", "message"]) {
    const candidate = record[key];
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return fallback;
}

async function failVideoJob(job: AiVideoJob, message: string) {
  const completedAt = new Date().toISOString();
  await updateAiVideoJob(job.id, job.user_id, {
    status: "failed",
    error_message: message,
    provider_last_contact_at: completedAt,
    completed_at: completedAt,
  });
  const media = await getAiVideoMediaByJob(job.id, job.user_id);
  if (media) {
    await updateAiVideoMedia(media.id, job.user_id, {
      status: "failed",
      error_message: message,
      completed_at: completedAt,
    });
  }
  return (await getAiVideoJob(job.id, job.user_id)) || job;
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
    providerCallId: job.modal_call_id,
    lastProviderContactAt: job.provider_last_contact_at || null,
    retryCount: job.retry_count || 0,
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
    negativePrompt: media.negative_prompt || "",
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
    stopGpuWhenQueueComplete: Boolean(media.stop_gpu_when_queue_complete),
    gpuShutdownStatus: media.gpu_shutdown_status || "not_requested",
    gpuShutdownMessage: media.gpu_shutdown_message || null,
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
    const providerContactAt = new Date().toISOString();

    if (resultResponse.status === 202) {
      await updateAiVideoJob(job.id, job.user_id, {
        status: "running",
        progress: estimatedProgress(job),
        error_message: null,
        provider_last_contact_at: providerContactAt,
        retry_count: 0,
      });
      const media = await getAiVideoMediaByJob(job.id, job.user_id);
      if (media?.error_message) {
        await updateAiVideoMedia(media.id, job.user_id, { error_message: null });
      }
      return (await getAiVideoJob(job.id, job.user_id)) || job;
    }

    if (!resultResponse.ok) {
      const body = await resultResponse.json().catch(() => ({}));
      const fallback = resultResponse.status === 404
        ? "The generation result expired before it could be saved."
        : `The video service stopped this generation (HTTP ${resultResponse.status}).`;
      const message = providerErrorMessage(body, fallback);
      if (providerResponseDisposition(resultResponse.status) === "terminal") {
        return failVideoJob(job, message);
      }
      throw new Error(message);
    }

    const result = (await resultResponse.json()) as {
      status?: string;
      download_path?: string;
      output_id?: string;
      detail?: unknown;
      error?: unknown;
      message?: unknown;
    };
    if (result.status === "failed" || result.status === "error") {
      return failVideoJob(
        job,
        providerErrorMessage(result, "The video provider could not complete this generation."),
      );
    }
    if (result.status !== "complete") {
      await updateAiVideoJob(job.id, job.user_id, {
        provider_last_contact_at: providerContactAt,
        retry_count: 0,
        error_message: null,
      });
      return (await getAiVideoJob(job.id, job.user_id)) || job;
    }
    const downloadPath = result.download_path ||
      (typeof result.output_id === "string" && result.output_id
        ? `/video/${encodeURIComponent(result.output_id)}`
        : null);
    if (!downloadPath) {
      return failVideoJob(
        job,
        "The video provider finished but did not return a downloadable result.",
      );
    }
    const latestJob = await getAiVideoJob(job.id, job.user_id);
    if (
      latestJob?.status === "failed" &&
      latestJob.error_message === "Cancelled by user."
    ) {
      return latestJob;
    }

    const videoResponse = await fetch(`${endpoint}${downloadPath}`, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (!videoResponse.ok || !videoResponse.body) {
      if (videoResponse.status >= 400 && videoResponse.status < 500) {
        return failVideoJob(
          job,
          `The generated video could not be downloaded (HTTP ${videoResponse.status}).`,
        );
      }
      throw new Error(`Generated video download failed (HTTP ${videoResponse.status}).`);
    }

    const outputKey = `experiments/ai-video/users/${job.user_id}/videos/${job.id}.mp4`;
    const contentType =
      videoResponse.headers.get("content-type") || "video/mp4";
    await (await getAiVideoMedia()).put(outputKey, videoResponse.body, {
      httpMetadata: { contentType },
    });
    const afterDownload = await getAiVideoJob(job.id, job.user_id);
    if (
      afterDownload?.status === "failed" &&
      afterDownload.error_message === "Cancelled by user."
    ) {
      await (await getAiVideoMedia()).delete(outputKey);
      return afterDownload;
    }

    const completedAt = new Date().toISOString();
    await completeGenerationMetric(job.generation_metric_id, "succeeded", completedAt);
    const media = await getAiVideoMediaByJob(job.id, job.user_id);
    const processingService = processingEndpoint();
    const processingAuth = processingHeaders();
    if (media && processingService && processingAuth && origin) {
      const token = crypto.randomUUID() + crypto.randomUUID();
      const taskId = `last-frame-${job.id}`;
      const task = {
        id: taskId, user_id: job.user_id, task_type: "last_frame" as const,
        status: "submitted" as const, progress: 5, source_media_id: media.id,
        scene_id: null, output_media_id: media.id, modal_call_id: null,
        modal_result_path: null, access_token_hash: await sha256(token),
        error_message: null, created_at: completedAt, updated_at: completedAt, completed_at: null,
      };
      const inserted = await insertProcessingTask(task);
      if (!inserted) {
        return (await getAiVideoJob(job.id, job.user_id)) || job;
      }
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
        await updateProcessingTask(taskId, {
          status: "pending", progress: 10, modal_call_id: data.call_id, modal_result_path: data.result_path,
        });
        await updateAiVideoJob(job.id, job.user_id, {
          status: "running", progress: 96, output_object_key: outputKey,
          output_mime_type: contentType, error_message: null,
          provider_last_contact_at: providerContactAt, retry_count: 0,
        });
        await updateAiVideoMedia(media.id, job.user_id, {
          status: "pending", content_object_key: outputKey, content_mime_type: contentType, error_message: null,
        });
        return (await getAiVideoJob(job.id, job.user_id)) || job;
      }
      await updateProcessingTask(taskId, {
        status: "failed",
        error_message: "Server-side last-frame extraction could not start.",
        access_token_hash: null,
        completed_at: new Date().toISOString(),
      });
    }
    await updateAiVideoJob(job.id, job.user_id, {
      status: "complete",
      progress: 100,
      output_object_key: outputKey,
      output_mime_type: contentType,
      completed_at: completedAt,
      error_message: null,
      provider_last_contact_at: providerContactAt,
      retry_count: 0,
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
  } catch (error) {
    const baseMessage = error instanceof Error
      ? error.message
      : "The provider result check failed.";
    const retry = nextRetryState(job.retry_count || 0, baseMessage);
    if (retry.terminal) return failVideoJob(job, retry.message);
    await updateAiVideoJob(job.id, job.user_id, {
      status: "running",
      progress: estimatedProgress(job),
      error_message: retry.message,
      retry_count: retry.retryCount,
    });
    const media = await getAiVideoMediaByJob(job.id, job.user_id);
    if (media) {
      await updateAiVideoMedia(media.id, job.user_id, {
        status: "pending",
        error_message: retry.message,
      });
    }
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
