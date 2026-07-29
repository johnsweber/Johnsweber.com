import {
  ensureAiVideoSchema,
  getLatestAiVideoJobForModel,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { getModelConfig } from "@/lib/ai-video-models";

export const dynamic = "force-dynamic";

const WARM_WINDOW_MS = 5 * 60 * 1_000;

export async function GET(request: Request) {
  try {
    await requireApiUser(request);
    await ensureAiVideoSchema();
    const modelKey = new URL(request.url).searchParams.get("model") || "";
    if (!getModelConfig(modelKey)) {
      return Response.json({ error: "Unknown model." }, { status: 400 });
    }
    const latest = await getLatestAiVideoJobForModel(modelKey);
    const active = latest?.status === "queued" || latest?.status === "running";
    const lastActivity = latest ? Date.parse(latest.updated_at) : 0;
    const recentlyActive =
      Number.isFinite(lastActivity) &&
      Date.now() - lastActivity < WARM_WINDOW_MS;
    const state = active || recentlyActive ? "warm" : "cold";
    return Response.json(
      {
        state,
        basis: active ? "active-job" : recentlyActive ? "recent-job" : "no-recent-job",
        checkedAt: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return Response.json({ error: "GPU status unavailable." }, { status: 500 });
  }
}
