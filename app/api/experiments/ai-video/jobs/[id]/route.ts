import {
  ensureAiVideoSchema,
  getAiVideoJob,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { publicAiVideoJob } from "@/lib/ai-video-service";

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
    return Response.json({ job: publicAiVideoJob(job) });
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "Unable to load this generation." }, { status: 500 });
  }
}
