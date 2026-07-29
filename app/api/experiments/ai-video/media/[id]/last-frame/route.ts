import {
  ensureAiVideoSchema,
  getAiVideoJob,
  getAiVideoMedia,
  getAiVideoMediaItem,
  updateAiVideoJob,
  updateAiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
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
      media.status !== "complete" ||
      !media.content_object_key
    ) {
      return Response.json({ error: "Completed video not found." }, { status: 404 });
    }

    const form = await request.formData();
    const frame = form.get("frame");
    if (!(frame instanceof File) || !frame.size) {
      return Response.json({ error: "Add a captured JPEG frame." }, { status: 400 });
    }
    if (frame.type !== "image/jpeg" || frame.size > 5 * 1024 * 1024) {
      return Response.json({ error: "The captured frame must be a JPEG under 5 MB." }, { status: 400 });
    }

    const key = `experiments/ai-video/users/${user.id}/last-frames/${media.id}.jpg`;
    await (await getAiVideoMedia()).put(key, frame.stream(), {
      httpMetadata: { contentType: "image/jpeg" },
      customMetadata: {
        userId: user.id,
        mediaId: media.id,
        source: "browser-capture",
      },
    });
    const completedAt = media.completed_at || new Date().toISOString();
    await updateAiVideoMedia(media.id, user.id, {
      thumbnail_object_key: key,
      last_frame_object_key: key,
      error_message: null,
      completed_at: completedAt,
    });
    if (media.job_id) {
      const job = await getAiVideoJob(media.job_id, user.id);
      if (job) {
        await updateAiVideoJob(job.id, user.id, {
          last_frame_object_key: key,
          status: "complete",
          progress: 100,
          error_message: null,
          completed_at: job.completed_at || completedAt,
        });
      }
    }
    const updated = await getAiVideoMediaItem(media.id, user.id);
    return Response.json({
      media: updated ? publicAiVideoMedia(updated) : null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to save the captured last frame." }, { status: 500 });
  }
}
