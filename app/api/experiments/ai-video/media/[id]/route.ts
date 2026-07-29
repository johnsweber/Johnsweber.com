import {
  ensureAiVideoSchema,
  getAiVideoJob,
  getAiVideoMediaItem,
  getPendingTaskForMedia,
  getSceneForMedia,
  updateAiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import {
  publicAiVideoJob,
  publicAiVideoMedia,
  refreshAiVideoMediaItem,
} from "@/lib/ai-video-service";
import { publicProcessingTask } from "@/lib/ai-video-processing";
import { purgeAiVideoMedia } from "@/lib/ai-video-media-cleanup";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    await ensureAiVideoSchema();
    const media = await getAiVideoMediaItem(id, user.id);
    if (!media) {
      return Response.json({ error: "Media not found." }, { status: 404 });
    }
    const refreshed = await refreshAiVideoMediaItem(media, new URL(request.url).origin);
    const scene = refreshed.media_type === "video" ? await getSceneForMedia(refreshed.id, user.id) : null;
    const job = refreshed.job_id
      ? await getAiVideoJob(refreshed.job_id, user.id)
      : null;
    const lastFrameTask = refreshed.media_type === "video"
      ? await getPendingTaskForMedia(refreshed.id, "last_frame")
      : null;
    return Response.json({
      media: publicAiVideoMedia(refreshed),
      sceneId: scene?.id || null,
      job: job ? publicAiVideoJob(job) : null,
      lastFrameTask: lastFrameTask ? publicProcessingTask(lastFrameTask) : null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load this media." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    await ensureAiVideoSchema();
    const media = await getAiVideoMediaItem(id, user.id);
    if (!media) {
      return Response.json({ error: "Media not found." }, { status: 404 });
    }

    await purgeAiVideoMedia(media);
    return new Response(null, { status: 204 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to delete this media." }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    await ensureAiVideoSchema();
    const media = await getAiVideoMediaItem(id, user.id);
    if (!media) {
      return Response.json({ error: "Media not found." }, { status: 404 });
    }
    const input = await request.json() as {
      durationSeconds?: number;
      retainFailed?: boolean;
    };
    if (typeof input.retainFailed === "boolean") {
      if (media.status !== "failed") {
        return Response.json(
          { error: "Only failed media can change automatic cleanup." },
          { status: 400 },
        );
      }
      await updateAiVideoMedia(id, user.id, {
        retain_failed: input.retainFailed ? 1 : 0,
      });
      const updated = await getAiVideoMediaItem(id, user.id);
      return Response.json({ media: updated ? publicAiVideoMedia(updated) : null });
    }
    if (media.media_type !== "video") {
      return Response.json({ error: "Video not found." }, { status: 404 });
    }
    const duration = Number(input.durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0 || duration > 86_400) {
      return Response.json({ error: "Invalid video duration." }, { status: 400 });
    }
    await updateAiVideoMedia(id, user.id, {
      duration_seconds: Math.round(duration * 1_000) / 1_000,
    });
    const updated = await getAiVideoMediaItem(id, user.id);
    return Response.json({ media: updated ? publicAiVideoMedia(updated) : null });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to update video metadata." }, { status: 500 });
  }
}
