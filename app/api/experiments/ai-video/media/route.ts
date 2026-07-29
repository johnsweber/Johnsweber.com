import {
  ensureAiVideoSchema,
  listAiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import {
  publicAiVideoMedia,
  refreshAiVideoMediaItem,
} from "@/lib/ai-video-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureAiVideoSchema();
    const type = new URL(request.url).searchParams.get("type");
    const mediaType =
      type === "picture" || type === "video" || type === "scene" ? type : undefined;
    const media = await listAiVideoMedia(user.id, mediaType);
    const refreshed = await Promise.all(
      media.map((item) =>
        item.status === "submitted" || item.status === "pending"
          ? refreshAiVideoMediaItem(item, new URL(request.url).origin)
          : item,
      ),
    );
    return Response.json({ media: refreshed.map(publicAiVideoMedia) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load your media." }, { status: 500 });
  }
}
