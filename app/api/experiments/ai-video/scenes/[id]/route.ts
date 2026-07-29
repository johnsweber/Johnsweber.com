import {
  copyAiVideoSceneThumbnail,
  ensureAiVideoSchema,
  getAiVideoMediaItem,
  getAiVideoScene,
  getProcessingTaskForScene,
  replaceAiVideoSceneItems,
  updateAiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { publicAiVideoMedia, refreshAiVideoMediaItem } from "@/lib/ai-video-service";
import { publicProcessingTask, refreshProcessingTask } from "@/lib/ai-video-processing";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    await ensureAiVideoSchema();
    const result = await getAiVideoScene(id, user.id);
    if (!result) return Response.json({ error: "Scene not found." }, { status: 404 });
    const items = await Promise.all(result.items.map(item =>
      item.status === "submitted" || item.status === "pending"
        ? refreshAiVideoMediaItem(item, new URL(request.url).origin)
        : item
    ));
    const task = await getProcessingTaskForScene(result.scene.id);
    const refreshed = task ? await refreshProcessingTask(task) : null;
    return Response.json({
      scene: { id: result.scene.id, mediaId: result.scene.media_id, title: result.scene.title },
      items: items.map(publicAiVideoMedia),
      exportTask: refreshed ? publicProcessingTask(refreshed) : null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load this scene." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    await ensureAiVideoSchema();
    const result = await getAiVideoScene(id, user.id);
    if (!result) return Response.json({ error: "Scene not found." }, { status: 404 });

    const input = await request.json() as { mediaIds?: unknown };
    if (
      !Array.isArray(input.mediaIds) ||
      input.mediaIds.length < 2 ||
      input.mediaIds.length > 100 ||
      input.mediaIds.some(mediaId => typeof mediaId !== "string")
    ) {
      return Response.json({ error: "A scene needs between 2 and 100 videos." }, { status: 400 });
    }
    const mediaIds = input.mediaIds as string[];
    if (new Set(mediaIds).size !== mediaIds.length) {
      return Response.json({ error: "A video can only appear once in a scene." }, { status: 400 });
    }

    const items = await Promise.all(mediaIds.map(mediaId =>
      getAiVideoMediaItem(mediaId, user.id)
    ));
    if (items.some(item =>
      !item ||
      item.media_type !== "video" ||
      item.status === "failed" ||
      (!item.content_object_key && item.status !== "submitted" && item.status !== "pending")
    )) {
      return Response.json({ error: "One or more videos are unavailable." }, { status: 409 });
    }

    await replaceAiVideoSceneItems(result.scene.id, user.id, mediaIds);
    const firstItem = items[0];
    if (firstItem) {
      const sceneThumbnailKey = await copyAiVideoSceneThumbnail(
        result.scene.id,
        user.id,
        firstItem,
      );
      await updateAiVideoMedia(result.scene.media_id, user.id, {
        thumbnail_object_key: sceneThumbnailKey,
      });
    }
    const duration = items.reduce((sum, item) => sum + (item?.duration_seconds || 0), 0);
    await updateAiVideoMedia(result.scene.media_id, user.id, {
      duration_seconds: duration,
    });
    const updated = await getAiVideoScene(result.scene.id, user.id);
    return Response.json({
      scene: {
        id: result.scene.id,
        mediaId: result.scene.media_id,
        title: result.scene.title,
      },
      items: updated?.items.map(publicAiVideoMedia) || [],
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to save this scene." }, { status: 500 });
  }
}
