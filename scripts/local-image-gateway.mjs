import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";

function argument(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

const comfyUrl = argument("--comfy-url", process.env.COMFY_URL || "http://127.0.0.1:8188").replace(/\/$/, "");
const tokenFile = argument("--token-file");
const gatewayToken =
  process.env.LOCAL_IMAGE_GATEWAY_TOKEN ||
  (tokenFile ? readFileSync(tokenFile, "utf8").trim() : "");
const port = Number(argument("--port", process.env.LOCAL_IMAGE_GATEWAY_PORT || "8789"));
const outputRoot = argument("--output-dir", process.env.COMFY_OUTPUT_DIR || "");
const images = new Map();

if (!gatewayToken || !outputRoot) {
  throw new Error("LOCAL_IMAGE_GATEWAY_TOKEN and COMFY_OUTPUT_DIR are required.");
}

function json(response, status, body) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64_000) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function authorized(request) {
  return request.headers.authorization === `Bearer ${gatewayToken}`;
}

function workflow({ prompt, negativePrompt, model, seed, width, height, steps }) {
  const checkpoint =
    model === "animagine"
      ? "animagine-xl-4.0-opt.safetensors"
      : "sd_xl_base_1.0.safetensors";
  const positive =
    model === "animagine"
      ? `${prompt}, masterpiece, best quality, very aesthetic, absurdres`
      : prompt;
  const negative =
    negativePrompt ||
    (model === "animagine"
      ? "lowres, worst quality, low quality, bad anatomy, bad hands, text, watermark"
      : "low quality, blurry, distorted, text, watermark");

  return {
    "3": {
      class_type: "KSampler",
      inputs: {
        seed,
        steps,
        cfg: model === "animagine" ? 5 : 7,
        sampler_name: "euler",
        scheduler: "normal",
        denoise: 1,
        model: ["4", 0],
        positive: ["6", 0],
        negative: ["7", 0],
        latent_image: ["5", 0],
      },
    },
    "4": {
      class_type: "CheckpointLoaderSimple",
      inputs: { ckpt_name: checkpoint },
    },
    "5": {
      class_type: "EmptyLatentImage",
      inputs: { width, height, batch_size: 1 },
    },
    "6": {
      class_type: "CLIPTextEncode",
      inputs: { text: positive, clip: ["4", 1] },
    },
    "7": {
      class_type: "CLIPTextEncode",
      inputs: { text: negative, clip: ["4", 1] },
    },
    "8": {
      class_type: "VAEDecode",
      inputs: { samples: ["3", 0], vae: ["4", 2] },
    },
    "9": {
      class_type: "SaveImage",
      inputs: { filename_prefix: `johnsweber_${model}`, images: ["8", 0] },
    },
  };
}

async function comfyJson(resource, init, timeoutMs = 10_000) {
  const response = await fetch(`${comfyUrl}${resource}`, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      body?.error?.message || body?.error || body?.message || `ComfyUI returned HTTP ${response.status}.`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return body;
}

async function generate(request, response) {
  if (!authorized(request)) return json(response, 401, { error: "Unauthorized." });

  const input = await readJson(request);
  const prompt = String(input.prompt || "").trim();
  const model = input.model === "animagine" ? "animagine" : "base";
  const seed = Number.isInteger(input.seed) && input.seed >= 0 ? input.seed : Math.floor(Math.random() * 2_147_483_647);
  const width = Math.max(512, Math.min(1536, Number(input.width) || 1024));
  const height = Math.max(512, Math.min(1536, Number(input.height) || 576));
  const steps = Math.max(1, Math.min(50, Number(input.steps) || (model === "animagine" ? 28 : 24)));
  if (!prompt) return json(response, 400, { error: "A prompt is required." });

  const queued = await comfyJson(
    "/prompt",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: workflow({
          prompt,
          negativePrompt: String(input.negativePrompt || "").trim(),
          model,
          seed,
          width,
          height,
          steps,
        }),
        client_id: randomUUID(),
      }),
    },
    15_000,
  );
  if (!queued.prompt_id) throw new Error("ComfyUI did not return a prompt ID.");

  const deadline = Date.now() + 240_000;
  let output;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    const history = await comfyJson(`/history/${encodeURIComponent(queued.prompt_id)}`, undefined, 10_000);
    const record = history[queued.prompt_id];
    if (record?.status?.status_str === "error") {
      const message = record.status.messages?.find((item) => item?.[0] === "execution_error")?.[1]?.exception_message;
      throw new Error(message || "ComfyUI generation failed.");
    }
    output = record?.outputs?.["9"]?.images?.[0];
    if (output?.filename) break;
  }
  if (!output?.filename) throw new Error("ComfyUI generation timed out.");

  const absoluteOutputRoot = path.resolve(outputRoot);
  const imagePath = path.resolve(absoluteOutputRoot, output.subfolder || "", output.filename);
  if (!imagePath.startsWith(`${absoluteOutputRoot}${path.sep}`)) {
    throw new Error("ComfyUI returned an invalid output path.");
  }

  const imageToken = randomUUID();
  images.set(imageToken, { imagePath, expiresAt: Date.now() + 10 * 60_000 });
  const protocol = request.headers["x-forwarded-proto"] || "http";
  const host = request.headers["x-forwarded-host"] || request.headers.host;
  json(response, 200, {
    image: {
      imageUrl: `${protocol}://${host}/images/${imageToken}`,
      mimeType: "image/png",
    },
    model,
    seed,
  });
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    if (request.method === "GET" && url.pathname === "/health") {
      const stats = await comfyJson("/system_stats", undefined, 3_000);
      return json(response, 200, {
        ok: true,
        comfy: true,
        devices: stats?.devices?.length || 0,
      });
    }
    if (request.method === "POST" && url.pathname === "/generate") {
      return await generate(request, response);
    }
    if (request.method === "GET" && url.pathname.startsWith("/images/")) {
      const imageToken = url.pathname.slice("/images/".length);
      const image = images.get(imageToken);
      if (!image || image.expiresAt < Date.now()) {
        images.delete(imageToken);
        return json(response, 404, { error: "Image expired or was not found." });
      }
      const body = await readFile(image.imagePath);
      response.writeHead(200, {
        "content-type": "image/png",
        "content-length": body.length,
        "cache-control": "private, max-age=300",
      });
      return response.end(body);
    }
    return json(response, 404, { error: "Not found." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local image generation failed.";
    return json(response, 503, { error: message });
  }
});

setInterval(() => {
  const now = Date.now();
  for (const [imageToken, image] of images) {
    if (image.expiresAt < now) images.delete(imageToken);
  }
}, 60_000).unref();

server.listen(port, "127.0.0.1");
