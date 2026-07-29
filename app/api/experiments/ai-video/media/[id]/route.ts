import {
  ensureAiVideoSchema,
  getAiVideoMediaItem,
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
    const refreshed = await refreshAiVideoMediaItem(media);
    return Response.json({ media: publicAiVideoMedia(refreshed) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load this media." }, { status: 500 });
  }
}

