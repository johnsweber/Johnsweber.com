import { ensureAiVideoSchema, getAiVideoScene, getProcessingTaskForScene } from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { publicAiVideoMedia } from "@/lib/ai-video-service";
import { publicProcessingTask, refreshProcessingTask } from "@/lib/ai-video-processing";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    await ensureAiVideoSchema();
    const result = await getAiVideoScene(id, user.id);
    if (!result) return Response.json({ error: "Scene not found." }, { status: 404 });
    const task = await getProcessingTaskForScene(result.scene.id);
    const refreshed = task ? await refreshProcessingTask(task) : null;
    return Response.json({
      scene: { id: result.scene.id, mediaId: result.scene.media_id, title: result.scene.title },
      items: result.items.map(publicAiVideoMedia),
      exportTask: refreshed ? publicProcessingTask(refreshed) : null,
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load this scene." }, { status: 500 });
  }
}
