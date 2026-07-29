import { Buffer } from "node:buffer";
import {
  ensureAiVideoSchema,
  completeGenerationMetric,
  completePendingAiVideoMedia,
  getAiVideoMedia,
  getAiVideoMediaItem,
  insertAiVideoMedia,
  inferGenerationColdStart,
  insertGenerationMetric,
  updateAiVideoMedia,
  upsertSharedUser,
  type AiVideoMedia,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { copyDemoAssetToR2, demoAssetFor } from "@/lib/demo-media";
import { publicAiVideoMedia } from "@/lib/ai-video-service";
import { requestUsesProduction } from "@/lib/production-mode";
import { getPictureSettings } from "@/lib/ai-picture-models";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let mediaId = "";
  let userId = "";
  let generationMetricId = "";
  try {
    const user = await requireApiUser(request);
    userId = user.id;
    await ensureAiVideoSchema();
    const useProduction = requestUsesProduction(request);

    const input = (await request.json()) as {
      prompt?: string;
      negativePrompt?: string;
      model?: string;
      preset?: string;
      aspect?: string;
      seed?: number;
      referenceMediaId?: string;
      strength?: number;
      displayName?: string;
      email?: string;
      avatarUrl?: string;
      stopGpuWhenQueueComplete?: boolean;
    };
    const prompt = input.prompt?.trim() || "";
    const negativePrompt = input.negativePrompt?.trim() || "";
    const settings = getPictureSettings(
      String(input.model || ""),
      String(input.preset || "medium"),
      String(input.aspect || "landscape"),
    );
    if (!settings) {
      return Response.json({ error: "Choose a supported picture configuration." }, { status: 400 });
    }
    const { model, preset, dimensions } = settings;
    const referenceMediaId = String(input.referenceMediaId || "");
    const strength = Number.isFinite(input.strength)
      ? Math.max(0.1, Math.min(0.95, Number(input.strength)))
      : 0.6;
    const seed = Number.isInteger(input.seed)
      ? Number(input.seed)
      : Math.floor(Math.random() * 2_147_483_647);
    const stopGpuWhenQueueComplete =
      useProduction && input.stopGpuWhenQueueComplete === true;
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
    generationMetricId = crypto.randomUUID();
    const generationProvider = useProduction ? model.provider : "demo";
    await insertGenerationMetric({
      id: generationMetricId,
      mediaType: "picture",
      modelKey: model.key,
      provider: generationProvider,
      coldStartUsed: await inferGenerationColdStart(model.key, generationProvider),
      startedAt: now,
      settings: {
        preset: String(input.preset || "medium"),
        aspect: String(input.aspect || "landscape"),
        width: dimensions.width,
        height: dimensions.height,
        steps: preset.steps,
        seed,
        hasReferenceImage: Boolean(referenceMediaId),
        strength,
        production: useProduction,
        stopGpuWhenQueueComplete,
      },
    });
    const media: AiVideoMedia = {
      id: mediaId,
      user_id: user.id,
      media_type: "picture",
      status: "submitted",
      model_key: model.key,
      prompt,
      negative_prompt: negativePrompt || null,
      quality: `${input.preset || "medium"}:${dimensions.width}x${dimensions.height}`,
      width: dimensions.width,
      height: dimensions.height,
      duration_seconds: null,
      fps: null,
      seed,
      job_id: null,
      thumbnail_object_key: null,
      last_frame_object_key: null,
      content_object_key: null,
      content_mime_type: null,
      error_message: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    await insertAiVideoMedia(media);
    await updateAiVideoMedia(mediaId, user.id, {
      status: "pending",
      stop_gpu_when_queue_complete: stopGpuWhenQueueComplete ? 1 : 0,
      gpu_shutdown_status: stopGpuWhenQueueComplete ? "waiting" : "not_requested",
      gpu_shutdown_message: null,
    });

    if (!useProduction) {
      const asset = demoAssetFor("picture", seed);
      const copied = await copyDemoAssetToR2(
        await getAiVideoMedia(),
        asset,
        user.id,
        mediaId,
      );
      const objectKey = copied.contentKey;
      const completedAt = new Date().toISOString();
      await completePendingAiVideoMedia(mediaId, user.id, {
        thumbnail_object_key: objectKey,
        content_object_key: objectKey,
        content_mime_type: copied.contentType,
        completed_at: completedAt,
      });
      await completeGenerationMetric(generationMetricId, "succeeded", completedAt);
      const complete = await getAiVideoMediaItem(mediaId, user.id);
      return Response.json(
        { media: complete ? publicAiVideoMedia(complete) : null },
        { status: 201 },
      );
    }

    let referenceImageBase64: string | undefined;
    if (referenceMediaId) {
      if (!model.supportsReference) {
        throw new Error(`${model.name} does not support reference-image editing.`);
      }
      const reference = await getAiVideoMediaItem(referenceMediaId, user.id);
      if (
        !reference ||
        reference.media_type !== "picture" ||
        reference.status !== "complete" ||
        !reference.content_object_key
      ) {
        throw new Error("The reference picture is unavailable.");
      }
      const object = await (await getAiVideoMedia()).get(reference.content_object_key);
      if (!object) throw new Error("The reference picture file is unavailable.");
      referenceImageBase64 = Buffer.from(await object.arrayBuffer()).toString("base64");
    }

    const gatewayUrl = (
      model.provider === "modal"
        ? process.env.Z_IMAGE_MODAL_URL
        : process.env.LOCAL_IMAGE_GATEWAY_URL
    )?.replace(/\/$/, "");
    const gatewayToken =
      model.provider === "modal"
        ? null
        : process.env.LOCAL_IMAGE_GATEWAY_TOKEN;
    if (!gatewayUrl) {
      throw new Error(
        model.provider === "modal"
          ? "Z-Image is not configured."
          : "The local picture generator is not configured.",
      );
    }
    if (model.provider !== "modal" && !gatewayToken) {
      throw new Error("The local picture generator is not configured.");
    }
    if (
      model.provider === "modal" &&
      (!process.env.MODAL_PROXY_TOKEN_ID || !process.env.MODAL_PROXY_TOKEN_SECRET)
    ) {
      throw new Error("Z-Image is not configured.");
    }

    const generated = await fetch(`${gatewayUrl}/generate`, {
      method: "POST",
      headers: {
        ...(model.provider === "modal"
          ? {
              "Modal-Key": process.env.MODAL_PROXY_TOKEN_ID as string,
              "Modal-Secret": process.env.MODAL_PROXY_TOKEN_SECRET as string,
            }
          : { Authorization: `Bearer ${gatewayToken}` }),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt,
        negativePrompt,
        model: model.key,
        seed,
        width: dimensions.width,
        height: dimensions.height,
        steps: preset.steps,
        image_base64: referenceImageBase64,
        strength,
      }),
      signal: AbortSignal.timeout(260_000),
    });
    const result = (await generated.json().catch(() => ({}))) as {
      image?: { imageUrl?: string; mimeType?: string };
      image_base64?: string;
      mime_type?: string;
      error?: string;
      detail?: unknown;
    };
    if (!generated.ok || (!result.image?.imageUrl && !result.image_base64)) {
      const detail = typeof result.detail === "string"
        ? result.detail
        : Array.isArray(result.detail)
          ? result.detail.map(item => {
              if (item && typeof item === "object" && "msg" in item) {
                return String((item as { msg?: unknown }).msg || "");
              }
              return JSON.stringify(item);
            }).filter(Boolean).join("; ")
          : "";
      throw new Error(result.error || detail || `${model.name} did not return a picture.`);
    }
    const beforeDownload = await getAiVideoMediaItem(mediaId, user.id);
    if (beforeDownload?.error_message === "Cancelled by user.") {
      return Response.json({ error: "Cancelled by user.", mediaId }, { status: 409 });
    }

    const imageResponse = result.image?.imageUrl
      ? await fetch(result.image.imageUrl, { signal: AbortSignal.timeout(30_000) })
      : null;
    if (imageResponse && (!imageResponse.ok || !imageResponse.body)) {
      throw new Error("The generated picture could not be retrieved.");
    }

    const contentType = result.mime_type ||
      imageResponse?.headers.get("content-type") ||
      result.image?.mimeType ||
      "image/png";
    const extension = contentType.includes("webp")
      ? "webp"
      : contentType.includes("jpeg")
        ? "jpg"
        : "png";
    const objectKey = `experiments/ai-video/users/${user.id}/pictures/${mediaId}.${extension}`;
    const imageBody = result.image_base64
      ? Buffer.from(result.image_base64, "base64")
      : imageResponse?.body;
    if (!imageBody) throw new Error("The generated picture was empty.");
    await (await getAiVideoMedia()).put(objectKey, imageBody, {
      httpMetadata: { contentType },
      customMetadata: { userId: user.id, experiment: "ai-video" },
    });

    const completedAt = new Date().toISOString();
    const completed = await completePendingAiVideoMedia(mediaId, user.id, {
      thumbnail_object_key: objectKey,
      content_object_key: objectKey,
      content_mime_type: contentType,
      completed_at: completedAt,
    });
    if (!completed) {
      await (await getAiVideoMedia()).delete(objectKey);
      return Response.json({ error: "Cancelled by user.", mediaId }, { status: 409 });
    }
    await completeGenerationMetric(generationMetricId, "succeeded", completedAt);
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
    await completeGenerationMetric(generationMetricId, "failed").catch(() => undefined);
    if (error instanceof Response) return error;
    return Response.json({ error: message, mediaId: mediaId || undefined }, { status: 503 });
  }
}
