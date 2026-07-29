import {
  getAiVideoMedia,
  getAiVideoMediaItem,
  getProcessingTask,
  updateAiVideoJob,
  updateAiVideoMedia,
  updateProcessingTask,
  type AiVideoProcessingTask,
} from "@/db/ai-video";

export function processingEndpoint() {
  return process.env.MEDIA_TOOLS_MODAL_URL?.replace(/\/$/, "") || null;
}

export function processingHeaders() {
  const key = process.env.MODAL_PROXY_TOKEN_ID;
  const secret = process.env.MODAL_PROXY_TOKEN_SECRET;
  if (!key || !secret) return null;
  return { "Content-Type": "application/json", "Modal-Key": key, "Modal-Secret": secret };
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function publicProcessingTask(task: AiVideoProcessingTask) {
  return {
    id: task.id, type: task.task_type, status: task.status, progress: task.progress,
    outputMediaId: task.output_media_id, sceneId: task.scene_id,
    errorMessage: task.error_message,
  };
}

export async function refreshProcessingTask(task: AiVideoProcessingTask) {
  if (task.status === "complete" || task.status === "failed" || !task.modal_result_path) return task;
  const endpoint = processingEndpoint();
  const headers = processingHeaders();
  if (!endpoint || !headers) return task;
  try {
    const response = await fetch(`${endpoint}${task.modal_result_path}`, {
      headers, signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 202) {
      await updateProcessingTask(task.id, {
        status: "pending",
        progress: Math.min(92, Math.max(task.progress + 4, 12)),
      });
      return (await getProcessingTask(task.id)) || task;
    }
    if (!response.ok) throw new Error("Media processing failed.");
    const result = await response.json() as {
      status?: string; download_path?: string; last_frame_path?: string;
      duration_seconds?: number;
    };
    if (result.status !== "complete") return task;
    if (task.task_type === "last_frame" && task.output_media_id && result.last_frame_path) {
      const frame = await fetch(`${endpoint}${result.last_frame_path}`, { headers, signal: AbortSignal.timeout(30_000) });
      if (!frame.ok || !frame.body) throw new Error("Last frame could not be downloaded.");
      const key = `experiments/ai-video/users/${task.user_id}/last-frames/${task.output_media_id}.jpg`;
      await (await getAiVideoMedia()).put(key, frame.body, { httpMetadata: { contentType: "image/jpeg" } });
      const media = await getAiVideoMediaItem(task.output_media_id, task.user_id);
      await updateAiVideoMedia(task.output_media_id, task.user_id, {
        status: "complete", thumbnail_object_key: key, last_frame_object_key: key,
        ...(Number.isFinite(result.duration_seconds) ? { duration_seconds: result.duration_seconds } : {}),
        completed_at: new Date().toISOString(), error_message: null,
      });
      if (media?.job_id) await updateAiVideoJob(media.job_id, task.user_id, {
        status: "complete", progress: 100, last_frame_object_key: key,
        completed_at: new Date().toISOString(), error_message: null,
      });
    }
    if (task.task_type === "scene_export" && task.output_media_id && result.download_path) {
      const video = await fetch(`${endpoint}${result.download_path}`, { headers, signal: AbortSignal.timeout(60_000) });
      if (!video.ok || !video.body) throw new Error("Merged video could not be downloaded.");
      const key = `experiments/ai-video/users/${task.user_id}/videos/${task.output_media_id}.mp4`;
      await (await getAiVideoMedia()).put(key, video.body, { httpMetadata: { contentType: "video/mp4" } });
      let frameKey: string | null = null;
      if (result.last_frame_path) {
        const frame = await fetch(`${endpoint}${result.last_frame_path}`, { headers, signal: AbortSignal.timeout(30_000) });
        if (frame.ok && frame.body) {
          frameKey = `experiments/ai-video/users/${task.user_id}/last-frames/${task.output_media_id}.jpg`;
          await (await getAiVideoMedia()).put(frameKey, frame.body, { httpMetadata: { contentType: "image/jpeg" } });
        }
      }
      await updateAiVideoMedia(task.output_media_id, task.user_id, {
        status: "complete", content_object_key: key, content_mime_type: "video/mp4",
        thumbnail_object_key: frameKey, last_frame_object_key: frameKey,
        ...(Number.isFinite(result.duration_seconds) ? { duration_seconds: result.duration_seconds } : {}),
        completed_at: new Date().toISOString(), error_message: null,
      });
    }
    await updateProcessingTask(task.id, {
      status: "complete", progress: 100, access_token_hash: null,
      completed_at: new Date().toISOString(), error_message: null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Media processing failed.";
    await updateProcessingTask(task.id, { status: "failed", error_message: message, access_token_hash: null });
    if (task.output_media_id) {
      if (task.task_type === "last_frame") {
        const media = await getAiVideoMediaItem(task.output_media_id, task.user_id);
        await updateAiVideoMedia(task.output_media_id, task.user_id, {
          status: "complete", completed_at: new Date().toISOString(),
        });
        if (media?.job_id) await updateAiVideoJob(media.job_id, task.user_id, {
          status: "complete", progress: 100, completed_at: new Date().toISOString(),
        });
      } else {
        await updateAiVideoMedia(task.output_media_id, task.user_id, { status: "failed", error_message: message });
      }
    }
  }
  return (await getProcessingTask(task.id)) || task;
}
