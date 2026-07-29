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
    if (!media?.content_object_key) return new Response(null, { status: 404 });

    const requestedRange =
      media.media_type === "video" ? request.headers.get("range") : null;
    const demoResponse = await proxyDemoMedia(media.content_object_key, {
      range: requestedRange,
    });
    if (demoResponse) return demoResponse;
    const object = await (await getAiVideoMedia()).get(
      media.content_object_key,
      requestedRange ? { range: request.headers } : undefined,
    );
    if (!object?.body) return new Response(null, { status: 404 });

    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Disposition": `inline; filename="${media.id}"`,
    });
    object.writeHttpMetadata(headers);
    let status = 200;
    if (media.media_type === "video") {
      headers.set("Accept-Ranges", "bytes");
      if (requestedRange && object.range) {
        const range = object.range;
        const start =
          "suffix" in range
            ? Math.max(0, object.size - range.suffix)
            : range.offset || 0;
        const length =
          "suffix" in range
            ? Math.min(range.suffix, object.size)
            : range.length || object.size - start;
        const end = Math.min(object.size - 1, start + length - 1);
        headers.set("Content-Range", `bytes ${start}-${end}/${object.size}`);
        headers.set("Content-Length", String(end - start + 1));
        status = 206;
      } else {
        headers.set("Content-Length", String(object.size));
      }
    }
    return new Response(object.body, { headers, status });
  } catch (error) {
    if (error instanceof Response) return error;
    return new Response(null, { status: 500 });
  }
}
