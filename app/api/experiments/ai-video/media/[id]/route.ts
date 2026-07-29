import {
  deleteAiVideoMediaItem,
  ensureAiVideoSchema,
  getAiVideoJob,
  getAiVideoMedia,
  getAiVideoMediaItem,
  getPendingTaskForMedia,
  getSceneForMedia,
  updateAiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import {
  publicAiVideoJob,
  publicAiVideoMedia,
} from "@/lib/ai-video-service";
import { publicProcessingTask } from "@/lib/ai-video-processing";

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
    const scene = media.media_type === "video" ? await getSceneForMedia(media.id, user.id) : null;
    const job = media.job_id
      ? await getAiVideoJob(media.job_id, user.id)
      : null;
    const lastFrameTask = media.media_type === "video"
      ? await getPendingTaskForMedia(media.id, "last_frame")
      : null;
    return Response.json({
      media: publicAiVideoMedia(media),
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

    const job = media.job_id
      ? await getAiVideoJob(media.job_id, user.id)
      : null;
    const objectKeys = Array.from(
      new Set(
        [
          media.thumbnail_object_key,
          media.content_object_key,
          media.last_frame_object_key,
          job?.source_object_key,
          job?.thumbnail_object_key,
          job?.output_object_key,
          job?.last_frame_object_key,
        ].filter(
          (key): key is string => Boolean(key && !key.startsWith("demo:")),
        ),
      ),
    );

    if (objectKeys.length) {
      await (await getAiVideoMedia()).delete(objectKeys);
    }
    await deleteAiVideoMediaItem(media.id, user.id, media.job_id);
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
    if (!media || media.media_type !== "video") {
      return Response.json({ error: "Video not found." }, { status: 404 });
    }
    const input = await request.json() as { durationSeconds?: number };
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
