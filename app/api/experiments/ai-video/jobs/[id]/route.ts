import {
  ensureAiVideoSchema,
  getAiVideoJob,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import {
  publicAiVideoJob,
  refreshAiVideoJob,
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
    const job = await getAiVideoJob(id, user.id);
    if (!job) return Response.json({ error: "Video not found." }, { status: 404 });
    const refreshed = await refreshAiVideoJob(job, new URL(request.url).origin);
    return Response.json({ job: publicAiVideoJob(refreshed) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load this generation." }, { status: 500 });
  }
}
