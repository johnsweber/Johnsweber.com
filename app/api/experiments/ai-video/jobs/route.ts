import { Buffer } from "node:buffer";
import {
  ensureAiVideoSchema,
  createOrAppendScene,
  getAiVideoMediaItem,
  getAiVideoMedia,
  insertAiVideoMedia,
  insertAiVideoJob,
  listAiVideoJobs,
  updateAiVideoMedia,
  updateAiVideoJob,
  type AiVideoMedia,
  upsertSharedUser,
  type AiVideoJob,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import { copyDemoAssetToR2, demoAssetFor } from "@/lib/demo-media";
import {
  getGenerationSettings,
  getModelConfig,
} from "@/lib/ai-video-models";
import { publicAiVideoJob } from "@/lib/ai-video-service";
import { requestUsesProduction } from "@/lib/production-mode";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json(
    { error: error instanceof Error ? error.message : "Request failed." },
    { status: 500 },
  );
}

function modalString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (!value || typeof value !== "object") return null;
  for (const key of ["object_id", "objectId", "id", "value"]) {
    const nested = (value as Record<string, unknown>)[key];
    if (typeof nested === "string" && nested.trim()) return nested;
  }
  return null;
}

function modalErrorMessage(detail: unknown) {
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        const location = Array.isArray(record.loc)
          ? record.loc.map(String).join(".")
          : "";
        const message =
          typeof record.msg === "string"
            ? record.msg
            : typeof record.message === "string"
              ? record.message
              : "";
        return [location, message].filter(Boolean).join(": ");
      })
      .filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    for (const key of ["message", "msg", "error"]) {
      if (typeof record[key] === "string" && record[key].trim()) {
        return record[key];
      }
    }
  }
  return "The model could not accept this generation.";
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureAiVideoSchema();
    const jobs = await listAiVideoJobs(user.id);
    return Response.json({ jobs: jobs.map(publicAiVideoJob) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser(request);
    await ensureAiVideoSchema();
    const useProduction = requestUsesProduction(request);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return Response.json(
        { error: "The browser upload could not be read. Re-select the reference image and try again." },
        { status: 400 },
      );
    }
    const modelKey = String(form.get("modelKey") || "");
    const qualityKey = String(form.get("quality") || "");
    const durationKey = String(form.get("duration") || "");
    const prompt = String(form.get("prompt") || "").trim();
    const negativePrompt = String(form.get("negativePrompt") || "").trim();
    const sourceProvider = String(form.get("sourceProvider") || "upload");
    const sourceModelKey = String(form.get("sourceModelKey") || "");
    const seedValue = Number(form.get("seed") || Math.floor(Math.random() * 2_147_483_647));
    const source = form.get("sourceImage");
    const referenceMediaId = String(form.get("referenceMediaId") || "");
    const extendMediaId = String(form.get("extendMediaId") || "");
    const requestedSceneId = String(form.get("sceneId") || "");
    const stopGpuWhenQueueComplete =
      useProduction && String(form.get("stopGpuWhenQueueComplete") || "") === "true";
    const settings = getGenerationSettings(modelKey, qualityKey, durationKey);

    if (!settings) {
      return Response.json({ error: "Choose a supported model configuration." }, { status: 400 });
    }
    if (!prompt || prompt.length > 2_000) {
      return Response.json({ error: "Add a prompt up to 2,000 characters." }, { status: 400 });
    }
    if (!Number.isInteger(seedValue) || seedValue < 0) {
      return Response.json({ error: "Seed must be a positive whole number." }, { status: 400 });
    }

    const model = getModelConfig(modelKey);
    if (!model) {
      return Response.json({ error: "Unknown model." }, { status: 400 });
    }

    const numberField = (name: string, fallback: number) => {
      const value = Number(form.get(name));
      return Number.isFinite(value) ? value : fallback;
    };
    const width = modelKey === "ltx23"
      ? numberField("outputWidth", 256)
      : settings.quality.width;
    const height = modelKey === "ltx23"
      ? numberField("outputHeight", 256)
      : settings.quality.height;
    const frames = numberField("numFrames", 9);
    const fps = numberField("frameRate", 1);
    const inferenceSteps = numberField("inferenceSteps", 1);
    const guidanceScale = numberField("guidanceScale", 0);
    const videoCrf = numberField("videoCrf", 28);

    if (
      modelKey === "ltx23" &&
      (!Number.isInteger(width) || !Number.isInteger(height) ||
        width < 256 || width > 1920 || height < 256 || height > 1920 ||
        width % 32 !== 0 || height % 32 !== 0)
    ) {
      return Response.json({ error: "LTX width and height must be 256–1920 pixels in 32-pixel increments." }, { status: 400 });
    }
    const maxFrames = modelKey === "wan22" ? 161 : 241;
    const frameStep = modelKey === "wan22" ? 4 : 8;
    if (!Number.isInteger(frames) || frames < 9 || frames > maxFrames || (frames - 1) % frameStep !== 0) {
      return Response.json({ error: `${model.name} frame count must be 9–${maxFrames} in ${frameStep}-frame increments.` }, { status: 400 });
    }
    const maxFps = modelKey === "wan22" ? 30 : 50;
    if (!Number.isInteger(fps) || fps < 1 || fps > maxFps) {
      return Response.json({ error: `${model.name} frame rate must be 1–${maxFps} fps.` }, { status: 400 });
    }
    if (
      modelKey === "wan22" &&
      (!Number.isInteger(inferenceSteps) || inferenceSteps < 1 || inferenceSteps > 80 ||
        guidanceScale < 0 || guidanceScale > 20 ||
        !Number.isInteger(videoCrf) || videoCrf < 14 || videoCrf > 28)
    ) {
      return Response.json({ error: "Wan controls are outside the supported range." }, { status: 400 });
    }
    const durationSeconds = Number((frames / fps).toFixed(3));
    const recordedQuality = modelKey === "ltx23" ? `${width}x${height}` : qualityKey;
    const computeScale =
      (width * height) / (settings.quality.width * settings.quality.height) *
      (frames / settings.duration.frames) *
      (modelKey === "wan22" ? inferenceSteps / 20 : 1);
    const estimatedSeconds = Math.max(20, Math.round(settings.estimate * computeScale));

    let imageBytes: ArrayBuffer | null = null;
    let sourceObjectKey: string | null = null;
    let sourceFileName: string | null = null;
    const id = crypto.randomUUID();

    let extendSource: AiVideoMedia | null = null;
    if (extendMediaId) {
      extendSource = await getAiVideoMediaItem(extendMediaId, user.id);
      if (!extendSource || extendSource.media_type !== "video" || extendSource.status !== "complete") {
        return Response.json({ error: "The video to extend is unavailable." }, { status: 404 });
      }
    }
    let referenceMedia: AiVideoMedia | null = null;
    if (referenceMediaId && !extendSource) {
      referenceMedia = await getAiVideoMediaItem(referenceMediaId, user.id);
      if (
        !referenceMedia ||
        referenceMedia.media_type !== "picture" ||
        referenceMedia.status !== "complete" ||
        !referenceMedia.content_object_key
      ) {
        return Response.json({ error: "The reference picture is unavailable." }, { status: 404 });
      }
    }

    if (model.supportsImage && useProduction) {
      if (extendSource?.last_frame_object_key) {
        const object = await (await getAiVideoMedia()).get(extendSource.last_frame_object_key);
        if (!object) return Response.json({ error: "The saved last frame is unavailable." }, { status: 409 });
        imageBytes = await object.arrayBuffer();
        sourceObjectKey = `experiments/ai-video/users/${user.id}/sources/${id}.jpg`;
        sourceFileName = `last-frame-${extendSource.id}.jpg`;
        await (await getAiVideoMedia()).put(sourceObjectKey, imageBytes, {
          httpMetadata: { contentType: "image/jpeg" },
          customMetadata: { userId: user.id, experiment: "ai-video" },
        });
      } else if (referenceMedia?.content_object_key) {
        const object = await (await getAiVideoMedia()).get(referenceMedia.content_object_key);
        if (!object) return Response.json({ error: "The reference picture file is unavailable." }, { status: 409 });
        const contentType = object.httpMetadata?.contentType || "image/jpeg";
        if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
          return Response.json({ error: "The saved reference must be a JPG, PNG, or WebP image." }, { status: 400 });
        }
        imageBytes = await object.arrayBuffer();
        const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
        sourceObjectKey = `experiments/ai-video/users/${user.id}/sources/${id}.${extension}`;
        sourceFileName = `picture-${referenceMedia.id}.${extension}`;
        await (await getAiVideoMedia()).put(sourceObjectKey, imageBytes, {
          httpMetadata: { contentType },
          customMetadata: { userId: user.id, experiment: "ai-video", referenceMediaId: referenceMedia.id },
        });
      } else if (!(source instanceof File) || !source.size) {
        return Response.json({ error: "Wan 2.2 requires a source image." }, { status: 400 });
      } else if (!["image/jpeg", "image/png", "image/webp"].includes(source.type)) {
        return Response.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
      } else if (source.size > 12 * 1024 * 1024) {
        return Response.json({ error: "Source images must be 12 MB or smaller." }, { status: 400 });
      } else {
        imageBytes = await source.arrayBuffer();
        const extension = source.type === "image/png" ? "png" : source.type === "image/webp" ? "webp" : "jpg";
        sourceObjectKey = `experiments/ai-video/users/${user.id}/sources/${id}.${extension}`;
        sourceFileName = source.name;
        await (await getAiVideoMedia()).put(sourceObjectKey, imageBytes, {
          httpMetadata: { contentType: source.type },
          customMetadata: { userId: user.id, experiment: "ai-video" },
        });
      }
    }

    await upsertSharedUser(user.id, {
      displayName: String(form.get("displayName") || "").slice(0, 160),
      email: String(form.get("email") || "").slice(0, 320),
      avatarUrl: String(form.get("avatarUrl") || "").slice(0, 1_000),
    });

    const now = new Date().toISOString();
    const media: AiVideoMedia = {
      id,
      user_id: user.id,
      media_type: "video",
      status: "submitted",
      model_key: modelKey,
      prompt,
      negative_prompt: negativePrompt || null,
      quality: recordedQuality,
      width,
      height,
      duration_seconds: durationSeconds,
      fps,
      seed: seedValue,
      job_id: id,
      thumbnail_object_key: sourceObjectKey,
      last_frame_object_key: null,
      content_object_key: null,
      content_mime_type: null,
      error_message: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    await insertAiVideoMedia(media);
    await updateAiVideoMedia(id, user.id, {
      stop_gpu_when_queue_complete: stopGpuWhenQueueComplete ? 1 : 0,
      gpu_shutdown_status: stopGpuWhenQueueComplete ? "waiting" : "not_requested",
      gpu_shutdown_message: null,
    });

    const job: AiVideoJob = {
      id,
      user_id: user.id,
      model_key: modelKey,
      generation_mode: model.mode,
      prompt,
      negative_prompt: negativePrompt || null,
      status: "queued",
      progress: 2,
      quality: recordedQuality,
      duration_seconds: durationSeconds,
      width,
      height,
      fps,
      seed: seedValue,
      estimated_seconds: estimatedSeconds,
      modal_call_id: null,
      modal_result_path: null,
      source_object_key: sourceObjectKey,
      source_file_name: sourceFileName,
      source_provider:
        !model.supportsImage
          ? "none"
          : sourceProvider === "local"
            ? "local"
            : "upload",
      source_model_key:
        sourceProvider === "local" && ["base", "animagine"].includes(sourceModelKey)
          ? sourceModelKey
          : null,
      thumbnail_object_key: sourceObjectKey,
      last_frame_object_key: null,
      output_object_key: null,
      output_mime_type: null,
      error_message: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    await insertAiVideoJob(job);
    const scene = extendSource
      ? await createOrAppendScene(user.id, extendSource, id, requestedSceneId || undefined)
      : null;

    if (!useProduction) {
      const asset = demoAssetFor("video", seedValue);
      const copied = await copyDemoAssetToR2(
        await getAiVideoMedia(),
        asset,
        user.id,
        id,
      );
      const contentObjectKey = copied.contentKey;
      const thumbnailObjectKey = copied.thumbnailKey;
      const completedAt = new Date().toISOString();
      await updateAiVideoJob(id, user.id, {
        status: "complete",
        progress: 100,
        output_object_key: contentObjectKey,
        output_mime_type: copied.contentType,
        completed_at: completedAt,
        error_message: null,
      });
      await updateAiVideoMedia(id, user.id, {
        status: "complete",
        thumbnail_object_key: thumbnailObjectKey,
        last_frame_object_key: thumbnailObjectKey,
        content_object_key: contentObjectKey,
        content_mime_type: copied.contentType,
        completed_at: completedAt,
        error_message: null,
      });
      return Response.json(
        {
          job: publicAiVideoJob({
            ...job,
            status: "complete",
            progress: 100,
        thumbnail_object_key: thumbnailObjectKey,
        last_frame_object_key: thumbnailObjectKey,
            output_object_key: contentObjectKey,
            output_mime_type: copied.contentType,
            completed_at: completedAt,
          }),
          sceneId: scene?.id || null,
        },
        { status: 201 },
      );
    }

    const endpoint = process.env[model.endpointEnv]?.replace(/\/$/, "");
    const modalKey = process.env.MODAL_PROXY_TOKEN_ID;
    const modalSecret = process.env.MODAL_PROXY_TOKEN_SECRET;
    if (!endpoint || !modalKey || !modalSecret) {
      await updateAiVideoJob(id, user.id, {
        status: "failed",
        error_message: "This model endpoint is not configured yet.",
      });
      await updateAiVideoMedia(id, user.id, {
        status: "failed",
        error_message: "This model endpoint is not configured yet.",
      });
      return Response.json({ error: "This model endpoint is not configured yet.", jobId: id }, { status: 503 });
    }

    const payload =
      modelKey === "wan22"
        ? {
            prompt,
            negative_prompt: negativePrompt,
            image_base64: Buffer.from(imageBytes as ArrayBuffer).toString("base64"),
            resolution: qualityKey,
            num_frames: frames,
            num_inference_steps: inferenceSteps,
            guidance_scale: guidanceScale,
            seed: seedValue,
            fps,
            video_crf: videoCrf,
          }
        : {
            prompt,
            width,
            height,
            num_frames: frames,
            frame_rate: fps,
            seed: seedValue,
          };

    const modalResponse = await fetch(`${endpoint}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Modal-Key": modalKey,
        "Modal-Secret": modalSecret,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    const modalData = (await modalResponse.json().catch(() => ({}))) as {
      call_id?: unknown;
      result_path?: unknown;
      detail?: unknown;
    };
    const resultPath = modalString(modalData.result_path);
    const callId =
      modalString(modalData.call_id) ||
      resultPath?.split("/").filter(Boolean).at(-1) ||
      null;

    if (!modalResponse.ok || !callId || !resultPath) {
      const message = modalErrorMessage(modalData.detail);
      await updateAiVideoJob(id, user.id, { status: "failed", error_message: message });
      await updateAiVideoMedia(id, user.id, {
        status: "failed",
        error_message: message,
      });
      return Response.json({ error: message, jobId: id }, { status: 502 });
    }

    await updateAiVideoJob(id, user.id, {
      modal_call_id: callId,
      modal_result_path: resultPath,
      status: "queued",
      progress: 4,
    });
    await updateAiVideoMedia(id, user.id, {
      status: "pending",
    });

    return Response.json(
      {
        job: publicAiVideoJob({
          ...job,
          modal_call_id: callId,
          modal_result_path: resultPath,
          progress: 4,
        }),
        sceneId: scene?.id || null,
      },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
