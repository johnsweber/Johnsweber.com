import {
  ensureAiVideoSchema,
  getAiVideoJob,
  getAiVideoMediaByJob,
  getAiVideoMediaItem,
  getProcessingTask,
  updateAiVideoJob,
  updateAiVideoMedia,
  updateProcessingTask,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import {
  processingEndpoint,
  processingHeaders,
} from "@/lib/ai-video-processing";

export const dynamic = "force-dynamic";

const CANCELLED = "Cancelled by user.";

async function cancelModalCall(callId: string | null) {
  const endpoint = processingEndpoint();
  const headers = processingHeaders();
  if (!callId || !endpoint || !headers) return false;
  try {
    const response = await fetch(
      `${endpoint}/cancel/${encodeURIComponent(callId)}`,
      {
        method: "POST",
        headers,
        signal: AbortSignal.timeout(10_000),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureAiVideoSchema();
    const input = await request.json() as { id?: string; kind?: string };
    const id = String(input.id || "");
    const now = new Date().toISOString();
    if (!id) return Response.json({ error: "Process ID is required." }, { status: 400 });

    if (input.kind === "video_generation") {
      const job = await getAiVideoJob(id, user.id);
      if (!job) return Response.json({ error: "Generation not found." }, { status: 404 });
      if (job.output_object_key || (job.status !== "queued" && job.status !== "running")) {
        return Response.json({ error: "This generation can no longer be cancelled." }, { status: 409 });
      }
      const remoteCancelled = await cancelModalCall(job.modal_call_id);
      await updateAiVideoJob(job.id, user.id, {
        status: "failed",
        error_message: CANCELLED,
        completed_at: now,
      });
      const media = await getAiVideoMediaByJob(job.id, user.id);
      if (media) await updateAiVideoMedia(media.id, user.id, {
        status: "failed",
        error_message: CANCELLED,
        completed_at: now,
      });
      return Response.json({ cancelled: true, remoteCancelled });
    }

    if (input.kind === "last_frame" || input.kind === "scene_export") {
      const task = await getProcessingTask(id, user.id);
      if (!task || task.task_type !== input.kind) {
        return Response.json({ error: "Processing task not found." }, { status: 404 });
      }
      if (task.status !== "submitted" && task.status !== "pending") {
        return Response.json({ error: "This task can no longer be cancelled." }, { status: 409 });
      }
      const remoteCancelled = await cancelModalCall(task.modal_call_id);
      await updateProcessingTask(task.id, {
        status: "failed",
        error_message: CANCELLED,
        access_token_hash: null,
        completed_at: now,
      });
      if (task.output_media_id) {
        const media = await getAiVideoMediaItem(task.output_media_id, user.id);
        if (media) {
          if (task.task_type === "last_frame" && media.content_object_key) {
            await updateAiVideoMedia(media.id, user.id, {
              status: "complete",
              error_message: null,
              completed_at: now,
            });
            if (media.job_id) await updateAiVideoJob(media.job_id, user.id, {
              status: "complete",
              progress: 100,
              error_message: null,
              completed_at: now,
            });
          } else {
            await updateAiVideoMedia(media.id, user.id, {
              status: "failed",
              error_message: CANCELLED,
              completed_at: now,
            });
          }
        }
      }
      return Response.json({ cancelled: true, remoteCancelled });
    }

    if (input.kind === "picture_generation") {
      const media = await getAiVideoMediaItem(id, user.id);
      if (!media || media.media_type !== "picture") {
        return Response.json({ error: "Picture generation not found." }, { status: 404 });
      }
      if (media.status !== "submitted" && media.status !== "pending") {
        return Response.json({ error: "This generation can no longer be cancelled." }, { status: 409 });
      }
      await updateAiVideoMedia(media.id, user.id, {
        status: "failed",
        error_message: CANCELLED,
        completed_at: now,
      });
      return Response.json({ cancelled: true, remoteCancelled: false });
    }

    return Response.json({ error: "Unknown process type." }, { status: 400 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to cancel this process." }, { status: 500 });
  }
}
