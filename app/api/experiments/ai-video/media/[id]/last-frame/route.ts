import {
  ensureAiVideoSchema,
  getAiVideoJob,
  getAiVideoMediaItem,
  getPendingTaskForMedia,
  insertProcessingTask,
  updateAiVideoJob,
  updateAiVideoMedia,
  updateProcessingTask,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import {
  processingEndpoint,
  processingHeaders,
  publicProcessingTask,
  sha256,
} from "@/lib/ai-video-processing";
import { publicAiVideoMedia } from "@/lib/ai-video-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    await ensureAiVideoSchema();
    const media = await getAiVideoMediaItem(id, user.id);
    if (
      !media ||
      media.media_type !== "video" ||
      media.status === "failed" ||
      !media.content_object_key
    ) {
      return Response.json({ error: "Saved video not found." }, { status: 404 });
    }

    const existing = await getPendingTaskForMedia(media.id, "last_frame");
    if (existing && (existing.status === "submitted" || existing.status === "pending")) {
      return Response.json({
        media: publicAiVideoMedia(media),
        task: publicProcessingTask(existing),
      }, { status: 202 });
    }

    const endpoint = processingEndpoint();
    const headers = processingHeaders();
    if (!endpoint || !headers) {
      return Response.json({ error: "The CPU media service is not configured." }, { status: 503 });
    }

    const now = new Date().toISOString();
    const taskId = crypto.randomUUID();
    const token = crypto.randomUUID() + crypto.randomUUID();
    const task = {
      id: taskId,
      user_id: user.id,
      task_type: "last_frame" as const,
      status: "submitted" as const,
      progress: 5,
      source_media_id: media.id,
      scene_id: null,
      output_media_id: media.id,
      modal_call_id: null,
      modal_result_path: null,
      access_token_hash: await sha256(token),
      error_message: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    await insertProcessingTask(task);

    const origin = new URL(request.url).origin;
    const response = await fetch(`${endpoint}/last-frame`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        source_url: `${origin}/api/experiments/ai-video/processing/${taskId}/source/${media.id}`,
        access_token: token,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as {
      call_id?: string;
      result_path?: string;
      detail?: string;
    };
    if (!response.ok || !data.call_id || !data.result_path) {
      const message = data.detail || "Server-side last-frame extraction could not start.";
      await updateProcessingTask(taskId, {
        status: "failed",
        error_message: message,
        access_token_hash: null,
      });
      return Response.json({ error: message }, { status: 502 });
    }

    await updateProcessingTask(taskId, {
      status: "pending",
      progress: 10,
      modal_call_id: data.call_id,
      modal_result_path: data.result_path,
    });
    await updateAiVideoMedia(media.id, user.id, {
      status: "pending",
      last_frame_object_key: null,
      error_message: null,
      completed_at: null,
    });
    if (media.job_id) {
      const job = await getAiVideoJob(media.job_id, user.id);
      if (job) {
        await updateAiVideoJob(job.id, user.id, {
          status: "running",
          progress: 96,
          last_frame_object_key: null,
          error_message: null,
          completed_at: null,
        });
      }
    }

    const updated = await getAiVideoMediaItem(media.id, user.id);
    return Response.json({
      media: updated ? publicAiVideoMedia(updated) : null,
      task: publicProcessingTask({
        ...task,
        status: "pending",
        progress: 10,
        modal_call_id: data.call_id,
        modal_result_path: data.result_path,
      }),
    }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({
      error: error instanceof Error ? error.message : "Unable to prepare the last frame.",
    }, { status: 500 });
  }
}
