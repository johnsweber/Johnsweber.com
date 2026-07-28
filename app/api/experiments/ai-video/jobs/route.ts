import { Buffer } from "node:buffer";
import {
  ensureAiVideoSchema,
  getAiVideoMedia,
  insertAiVideoJob,
  listAiVideoJobs,
  updateAiVideoJob,
  upsertSharedUser,
  type AiVideoJob,
} from "@/db/ai-video";
import { requireApiUser } from "@/lib/api-auth";
import {
  getGenerationSettings,
  getModelConfig,
} from "@/lib/ai-video-models";
import { publicAiVideoJob } from "@/lib/ai-video-service";

export const dynamic = "force-dynamic";

function errorResponse(error: unknown) {
  if (error instanceof Response) return error;
  return Response.json(
    { error: error instanceof Error ? error.message : "Request failed." },
    { status: 500 },
  );
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

    const form = await request.formData();
    const modelKey = String(form.get("modelKey") || "");
    const qualityKey = String(form.get("quality") || "");
    const durationKey = String(form.get("duration") || "");
    const prompt = String(form.get("prompt") || "").trim();
    const negativePrompt = String(form.get("negativePrompt") || "").trim();
    const seedValue = Number(form.get("seed") || Math.floor(Math.random() * 2_147_483_647));
    const source = form.get("sourceImage");
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

    let imageBytes: ArrayBuffer | null = null;
    let sourceObjectKey: string | null = null;
    let sourceFileName: string | null = null;
    const id = crypto.randomUUID();

    if (model.supportsImage) {
      if (!(source instanceof File) || !source.size) {
        return Response.json({ error: "Wan 2.2 requires a source image." }, { status: 400 });
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(source.type)) {
        return Response.json({ error: "Use a JPG, PNG, or WebP image." }, { status: 400 });
      }
      if (source.size > 12 * 1024 * 1024) {
        return Response.json({ error: "Source images must be 12 MB or smaller." }, { status: 400 });
      }
      imageBytes = await source.arrayBuffer();
      const extension = source.type === "image/png" ? "png" : source.type === "image/webp" ? "webp" : "jpg";
      sourceObjectKey = `experiments/ai-video/users/${user.id}/sources/${id}.${extension}`;
      sourceFileName = source.name;
      await (await getAiVideoMedia()).put(sourceObjectKey, imageBytes, {
        httpMetadata: { contentType: source.type },
        customMetadata: { userId: user.id, experiment: "ai-video" },
      });
    }

    await upsertSharedUser(user.id, {
      displayName: String(form.get("displayName") || "").slice(0, 160),
      email: String(form.get("email") || "").slice(0, 320),
      avatarUrl: String(form.get("avatarUrl") || "").slice(0, 1_000),
    });

    const now = new Date().toISOString();
    const job: AiVideoJob = {
      id,
      user_id: user.id,
      model_key: modelKey,
      generation_mode: model.mode,
      prompt,
      negative_prompt: negativePrompt || null,
      status: "queued",
      progress: 2,
      quality: qualityKey,
      duration_seconds: settings.duration.seconds,
      width: settings.quality.width,
      height: settings.quality.height,
      fps: settings.duration.fps,
      seed: seedValue,
      estimated_seconds: settings.estimate,
      modal_call_id: null,
      modal_result_path: null,
      source_object_key: sourceObjectKey,
      source_file_name: sourceFileName,
      thumbnail_object_key: sourceObjectKey,
      output_object_key: null,
      output_mime_type: null,
      error_message: null,
      created_at: now,
      updated_at: now,
      completed_at: null,
    };
    await insertAiVideoJob(job);

    const endpoint = process.env[model.endpointEnv]?.replace(/\/$/, "");
    const modalKey = process.env.MODAL_PROXY_TOKEN_ID;
    const modalSecret = process.env.MODAL_PROXY_TOKEN_SECRET;
    if (!endpoint || !modalKey || !modalSecret) {
      await updateAiVideoJob(id, user.id, {
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
            num_frames: settings.duration.frames,
            num_inference_steps: 40,
            guidance_scale: 3.5,
            seed: seedValue,
            fps: settings.duration.fps,
          }
        : {
            prompt,
            width: settings.quality.width,
            height: settings.quality.height,
            num_frames: settings.duration.frames,
            frame_rate: settings.duration.fps,
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
    const modalData = (await modalResponse.json()) as {
      call_id?: string;
      result_path?: string;
      detail?: string;
    };

    if (!modalResponse.ok || !modalData.call_id || !modalData.result_path) {
      const message = modalData.detail || "The model could not accept this generation.";
      await updateAiVideoJob(id, user.id, { status: "failed", error_message: message });
      return Response.json({ error: message, jobId: id }, { status: 502 });
    }

    await updateAiVideoJob(id, user.id, {
      modal_call_id: modalData.call_id,
      modal_result_path: modalData.result_path,
      status: "queued",
      progress: 4,
    });

    return Response.json(
      { job: publicAiVideoJob({ ...job, modal_call_id: modalData.call_id, modal_result_path: modalData.result_path, progress: 4 }) },
      { status: 202 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
