import {
  ensureAiVideoSchema,
  getAiVideoJob,
  getAiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";

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
    if (!job?.thumbnail_object_key) return new Response(null, { status: 404 });
    const object = await (await getAiVideoMedia()).get(job.thumbnail_object_key);
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
