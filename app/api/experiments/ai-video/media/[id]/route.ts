import {
  deleteAiVideoMediaItem,
  ensureAiVideoSchema,
  getAiVideoJob,
  getAiVideoMedia,
  getAiVideoMediaItem,
  getSceneForMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import {
  publicAiVideoMedia,
  refreshAiVideoMediaItem,
} from "@/lib/ai-video-service";

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
    return Response.json({ media: publicAiVideoMedia(refreshed), sceneId: scene?.id || null });
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
