import {
  ensureAiVideoSchema,
  getAiVideoMedia,
  getAiVideoMediaItem,
  insertAiVideoMedia,
  updateAiVideoMedia,
  upsertSharedUser,
  type AiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { demoAssetFor, demoContentKey } from "@/lib/demo-media";
import { publicAiVideoMedia } from "@/lib/ai-video-service";
import { requestUsesProduction } from "@/lib/production-mode";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let mediaId = "";
  let userId = "";
  try {
    const user = await requireApiUser(request);
    userId = user.id;
    await ensureAiVideoSchema();
    const useProduction = requestUsesProduction(request);

    const input = (await request.json()) as {
      prompt?: string;
      negativePrompt?: string;
      model?: string;
      seed?: number;
      displayName?: string;
      email?: string;
      avatarUrl?: string;
    };
    const prompt = input.prompt?.trim() || "";
    const negativePrompt = input.negativePrompt?.trim() || "";
    const model = input.model === "animagine" ? "animagine" : "base";
    const seed = Number.isInteger(input.seed)
      ? Number(input.seed)
      : Math.floor(Math.random() * 2_147_483_647);
    if (!prompt || prompt.length > 2_000) {
      return Response.json(
        { error: "Add a picture prompt up to 2,000 characters." },
        { status: 400 },
      );
    }
    if (seed < 0) {
      return Response.json(
        { error: "Seed must be a positive whole number." },
        { status: 400 },
      );
    }

    await upsertSharedUser(user.id, {
      displayName: String(input.displayName || "").slice(0, 160),
      email: String(input.email || "").slice(0, 320),
      avatarUrl: String(input.avatarUrl || "").slice(0, 1_000),
    });

    mediaId = crypto.randomUUID();
    const now = new Date().toISOString();
    const media: AiVideoMedia = {
      id: mediaId,
      user_id: user.id,
      media_type: "picture",
      status: "submitted",
      model_key: model,
      prompt,
      negative_prompt: negativePrompt || null,
      quality: "1024x576",
      width: 1024,
      height: 576,
      duration_seconds: null,
      fps: null,
      seed,
      job_id: null,
      thumbnail_object_key: null,
      content_object_key: null,
      content_mime_type: null,
      error_message: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    await insertAiVideoMedia(media);
    await updateAiVideoMedia(mediaId, user.id, { status: "pending" });

    if (!useProduction) {
      const asset = demoAssetFor("picture", seed);
      const objectKey = demoContentKey(asset);
      const completedAt = new Date().toISOString();
      await updateAiVideoMedia(mediaId, user.id, {
        status: "complete",
        thumbnail_object_key: objectKey,
        content_object_key: objectKey,
        content_mime_type: asset.mimeType,
        completed_at: completedAt,
        error_message: null,
      });
      const complete = await getAiVideoMediaItem(mediaId, user.id);
      return Response.json(
        { media: complete ? publicAiVideoMedia(complete) : null },
        { status: 201 },
      );
    }

    const gatewayUrl = process.env.LOCAL_IMAGE_GATEWAY_URL?.replace(/\/$/, "");
    const gatewayToken = process.env.LOCAL_IMAGE_GATEWAY_TOKEN;
    if (!gatewayUrl || !gatewayToken) {
      throw new Error("The local picture generator is not configured.");
    }

    const generated = await fetch(`${gatewayUrl}/generate`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${gatewayToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        negativePrompt,
        model,
        seed,
        width: 1024,
        height: 576,
      }),
      signal: AbortSignal.timeout(260_000),
    });
    const result = (await generated.json().catch(() => ({}))) as {
      image?: { imageUrl?: string; mimeType?: string };
      error?: string;
    };
    if (!generated.ok || !result.image?.imageUrl) {
      throw new Error(result.error || "The local GPU did not return a picture.");
    }

    const imageResponse = await fetch(result.image.imageUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    if (!imageResponse.ok || !imageResponse.body) {
      throw new Error("The generated picture could not be retrieved.");
    }

    const contentType =
      imageResponse.headers.get("content-type") ||
      result.image.mimeType ||
      "image/png";
    const extension = contentType.includes("webp")
      ? "webp"
      : contentType.includes("jpeg")
        ? "jpg"
        : "png";
    const objectKey = `experiments/ai-video/users/${user.id}/pictures/${mediaId}.${extension}`;
    await (await getAiVideoMedia()).put(objectKey, imageResponse.body, {
      httpMetadata: { contentType },
      customMetadata: { userId: user.id, experiment: "ai-video" },
    });

    const completedAt = new Date().toISOString();
    await updateAiVideoMedia(mediaId, user.id, {
      status: "complete",
      thumbnail_object_key: objectKey,
      content_object_key: objectKey,
      content_mime_type: contentType,
      completed_at: completedAt,
      error_message: null,
    });
    const complete = await getAiVideoMediaItem(mediaId, user.id);
    return Response.json(
      { media: complete ? publicAiVideoMedia(complete) : null },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "The local GPU is unavailable.";
    if (mediaId && userId) {
      await updateAiVideoMedia(mediaId, userId, {
        status: "failed",
        error_message: message,
      }).catch(() => undefined);
    }
    if (error instanceof Response) return error;
    return Response.json({ error: message, mediaId: mediaId || undefined }, { status: 503 });
  }
}
