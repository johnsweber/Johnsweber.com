import {
  ensureAiVideoSchema, getAiVideoMedia, getAiVideoMediaItem,
  getProcessingTask, processingTaskAllowsMedia,
} from "@/db/ai-video";
import { proxyDemoMedia } from "@/lib/demo-media";
import { sha256 } from "@/lib/ai-video-processing";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ taskId: string; mediaId: string }> }) {
  const { taskId, mediaId } = await context.params;
  await ensureAiVideoSchema();
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  const task = await getProcessingTask(taskId);
  if (!task?.access_token_hash || !token || await sha256(token) !== task.access_token_hash) {
    return new Response(null, { status: 401 });
  }
  if (!(await processingTaskAllowsMedia(taskId, mediaId))) return new Response(null, { status: 403 });
  const media = await getAiVideoMediaItem(mediaId, task.user_id);
  if (!media?.content_object_key) return new Response(null, { status: 404 });
  const demo = await proxyDemoMedia(media.content_object_key);
  if (demo) return demo;
  const object = await (await getAiVideoMedia()).get(media.content_object_key);
  if (!object?.body) return new Response(null, { status: 404 });
  const headers = new Headers({ "Cache-Control": "private, no-store" });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
