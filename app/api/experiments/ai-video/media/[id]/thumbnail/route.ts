import {
  ensureAiVideoSchema,
  getAiVideoMedia,
  getAiVideoMediaItem,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { proxyDemoMedia } from "@/lib/demo-media";

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
    const objectKey = media?.thumbnail_object_key || media?.content_object_key;
    if (!objectKey) return new Response(null, { status: 404 });
    const demoResponse = await proxyDemoMedia(objectKey, { thumbnail: true });
    if (demoResponse) return demoResponse;
    const object = await (await getAiVideoMedia()).get(objectKey);
    if (!object?.body) return new Response(null, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, max-age=300");
    return new Response(object.body, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 500 });
  }
}
