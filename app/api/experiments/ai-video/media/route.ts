import {
  ensureAiVideoSchema,
  listAiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { publicAiVideoMedia } from "@/lib/ai-video-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureAiVideoSchema();
    const type = new URL(request.url).searchParams.get("type");
    const mediaType =
      type === "picture" || type === "video" || type === "scene" ? type : undefined;
    const media = await listAiVideoMedia(user.id, mediaType);
    return Response.json({ media: media.map(publicAiVideoMedia) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load your media." }, { status: 500 });
  }
}
