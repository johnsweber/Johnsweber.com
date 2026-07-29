import {
  ensureAiVideoSchema, getAiVideoScene, insertAiVideoMedia, insertProcessingTask,
  updateAiVideoMedia, updateProcessingTask, type AiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { processingEndpoint, processingHeaders, publicProcessingTask, sha256 } from "@/lib/ai-video-processing";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    await ensureAiVideoSchema();
    const result = await getAiVideoScene(id, user.id);
    if (!result || result.items.length < 2) return Response.json({ error: "A scene needs at least two clips." }, { status: 409 });
    const now = new Date().toISOString();
    const outputId = crypto.randomUUID();
    const duration = result.items.reduce((sum, item) => sum + (item.duration_seconds || 0), 0);
    const first = result.items[0];
    const media: AiVideoMedia = {
      id: outputId, user_id: user.id, media_type: "video", status: "submitted",
      model_key: "scene-export", prompt: `Export — ${result.scene.title}`, negative_prompt: null,
      quality: first.quality, width: first.width, height: first.height, duration_seconds: duration,
      fps: first.fps, seed: first.seed, job_id: null, thumbnail_object_key: null,
      last_frame_object_key: null, content_object_key: null, content_mime_type: null,
      error_message: null, created_at: now, updated_at: now, completed_at: null,
    };
    await insertAiVideoMedia(media);
    const endpoint = processingEndpoint();
    const headers = processingHeaders();
    if (!endpoint || !headers) throw new Error("The CPU media service is not configured.");
    const taskId = crypto.randomUUID();
    const token = crypto.randomUUID() + crypto.randomUUID();
    const task = {
      id: taskId, user_id: user.id, task_type: "scene_export" as const,
      status: "submitted" as const, progress: 3, source_media_id: null, scene_id: result.scene.id,
      output_media_id: outputId, modal_call_id: null, modal_result_path: null,
      access_token_hash: await sha256(token), error_message: null,
      created_at: now, updated_at: now, completed_at: null,
    };
    await insertProcessingTask(task);
    await updateAiVideoMedia(outputId, user.id, { status: "pending" });
    const origin = new URL(request.url).origin;
    const response = await fetch(`${endpoint}/merge`, {
      method: "POST", headers,
      body: JSON.stringify({
        source_urls: result.items.map(item => `${origin}/api/experiments/ai-video/processing/${taskId}/source/${item.id}`),
        access_token: token,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json().catch(() => ({})) as { call_id?: string; result_path?: string; detail?: string };
    if (!response.ok || !data.call_id || !data.result_path) throw new Error(data.detail || "The export could not start.");
    await updateProcessingTask(taskId, { status: "pending", progress: 8, modal_call_id: data.call_id, modal_result_path: data.result_path });
    return Response.json({ outputMediaId: outputId, task: publicProcessingTask({ ...task, status: "pending", progress: 8, modal_call_id: data.call_id, modal_result_path: data.result_path }) }, { status: 202 });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: error instanceof Error ? error.message : "Export could not start." }, { status: 500 });
  }
}
