import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  MAX_PROVIDER_RETRIES,
  nextRetryState,
  providerResponseDisposition,
  shouldReconcileJob,
  shouldReconcileTask,
} from "../lib/ai-video-reconcile-policy.mjs";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the John Weber playground", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>John Weber — Product Thinker, Builder &amp; AI Tinkerer<\/title>/i);
  assert.match(html, /I make complex technology/);
  assert.match(html, /Open site menu/);
  assert.match(html, /Log in/);
  assert.match(html, /Run GPU probe/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("renders source-verified career, portfolio, and resume paths", async () => {
  const homeResponse = await render();
  const home = await homeResponse.text();
  assert.match(home, /CAREER, IN BRIEF/);
  assert.match(home, /Explore the portfolio/);
  assert.match(home, /Read the résumé/);

  const portfolioResponse = await render("/portfolio");
  assert.equal(portfolioResponse.status, 200);
  const portfolio = await portfolioResponse.text();
  assert.match(portfolio, /Making a desktop-scale rebrand work everywhere/);
  assert.match(portfolio, /Designing for trust, connection, and human-ness/);
  assert.match(portfolio, /Turning model infrastructure into a friendly playground/);

  const resumeResponse = await render("/resume");
  assert.equal(resumeResponse.status, 200);
  const resume = await resumeResponse.text();
  assert.match(resume, /Chief Product Officer/);
  assert.match(resume, /Senior Design Lead/);
  assert.match(resume, /coached six additional development teams/i);
  assert.doesNotMatch(resume, /100\+ developers|\$1M|double-digit growth/i);
});

test("uses the interactive logic portrait instead of the AI badge", async () => {
  const home = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const visual = await readFile(
    new URL("../app/hero-logic-image.tsx", import.meta.url),
    "utf8",
  );
  assert.match(home, /<HeroLogicImage \/>/);
  assert.doesNotMatch(home, /network-core/);
  assert.match(visual, /LOGIC IN MOTION/);
  assert.match(visual, /logic-watercolor/);
  assert.match(visual, /setPointerCapture/);
  assert.match(visual, /requestPermission/);
  assert.match(visual, /onPointerMove/);
});

test("renders Google and Apple account creation", async () => {
  const response = await render("/create-account");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /One identity\. Every experiment\./);
  assert.match(html, /Continue with Google/);
  assert.match(html, /Continue with Apple/);
  assert.doesNotMatch(
    html,
    /type="password"|type="email"|name="password"|name="email"/i,
  );
});

test("renders signed-out user management", async () => {
  const response = await render("/manage-account");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Your account space is ready|Loading your account/);
  if (html.includes("Your account space is ready")) {
    assert.match(html, /View login/);
  }
});

test("renders the protected AI Video experiment gate", async () => {
  const response = await render("/experiments/ai-video");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /AI VIDEO|Opening AI Video/);
  if (html.includes("AI VIDEO")) {
    assert.match(html, /AI Video is ready for authentication/);
  }
  assert.doesNotMatch(html, /source images, generations, and library stay attached/i);
});

test("renders the unlisted interactive hero preview", async () => {
  const response = await render("/hero-preview");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /Logic Playground Preview/);
  assert.match(html, /Move it\./);
  assert.match(html, /See what connects\./);
  assert.match(html, /Reroute/);
  assert.match(html, /name="robots" content="noindex, nofollow"/i);
});

test("separates picture and video creation models", async () => {
  const source = await readFile(
    new URL("../app/experiments/ai-video/ai-video-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /Creation type/);
  assert.match(source, /> Picture/);
  assert.match(source, /> Video/);
  assert.match(source, /SDXL Base 1\.0/);
  assert.match(source, /Animagine XL 4\.0/);
  assert.match(source, /Wan \+ LTX/);
  assert.match(source, /Choose reference image/);
  assert.match(source, /Choose and preview a reference image/);
  assert.match(source, /Animate picture/);
  assert.match(source, /referenceMediaId/);
  assert.match(source, /Generation preset/);
  assert.match(source, /Cheapest settings to verify the pipeline/);
  assert.match(source, /Balanced settings for a short, viewable result/);
  assert.match(source, /Highest-quality supported output/);
  assert.match(source, /applyGenerationPreset/);
  assert.match(source, /setGenerationPreset\("custom"\)/);
  assert.match(source, /Estimated generation/);
  assert.match(source, /GPU warm/);
  assert.match(source, /renderEstimateSeconds/);
  assert.match(source, /optimizeReferenceImage/);
  assert.match(source, /1_500_000/);
  assert.match(source, /Optimizing reference/);
  assert.match(source, /canvas\.toBlob/);
  assert.doesNotMatch(source, /videoModel\.supportsImage && useProduction && \(/);
  assert.match(source, /onSubmit=\{submit\} noValidate/);
  assert.doesNotMatch(source, /disabled=\{\s*submitting \|\|\s*!prompt/);
  assert.doesNotMatch(source, /sourceMode|Generate source locally/);
});

test("reports recent GPU capacity without warming a model", async () => {
  const capacity = await readFile(
    new URL("../app/api/experiments/ai-video/capacity/route.ts", import.meta.url),
    "utf8",
  );
  const database = await readFile(
    new URL("../db/ai-video.ts", import.meta.url),
    "utf8",
  );
  assert.match(capacity, /WARM_WINDOW_MS = 5 \* 60 \* 1_000/);
  assert.match(capacity, /active-job/);
  assert.match(capacity, /Cache-Control/);
  assert.doesNotMatch(capacity, /fetch\(|spawn|warmup/);
  assert.match(database, /getLatestAiVideoJobForModel/);
  assert.match(database, /modal_call_id IS NOT NULL/);
});

test("deletes only user-owned media records and stored objects", async () => {
  const route = await readFile(
    new URL("../app/api/experiments/ai-video/media/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const database = await readFile(new URL("../db/ai-video.ts", import.meta.url), "utf8");
  const app = await readFile(
    new URL("../app/experiments/ai-video/ai-video-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /export async function DELETE/);
  assert.match(route, /getAiVideoMediaItem\(id, user\.id\)/);
  assert.match(route, /\.delete\(objectKeys\)/);
  assert.match(database, /DELETE FROM ai_video_media WHERE id = \? AND user_id = \?/);
  assert.match(database, /DELETE FROM ai_video_jobs WHERE id = \? AND user_id = \?/);
  assert.match(app, /EllipsisVertical/);
  assert.match(app, /Delete this media item and its saved file/);
});

test("defaults generation to session-scoped demo mode", async () => {
  const navigation = await readFile(
    new URL("../app/site-navigation.tsx", import.meta.url),
    "utf8",
  );
  const productionMode = await readFile(
    new URL("../lib/production-mode.ts", import.meta.url),
    "utf8",
  );
  const sessionMode = await readFile(
    new URL("../lib/use-production-mode.ts", import.meta.url),
    "utf8",
  );
  const demoMedia = await readFile(
    new URL("../lib/demo-media.ts", import.meta.url),
    "utf8",
  );
  const aiVideo = await readFile(
    new URL("../app/experiments/ai-video/ai-video-app.tsx", import.meta.url),
    "utf8",
  );
  assert.match(navigation, /Use Production/);
  assert.match(navigation, />\s*Demo\s*</);
  assert.match(navigation, />\s*Production\s*</);
  assert.match(sessionMode, /sessionStorage/);
  assert.match(sessionMode, /useState\(false\)/);
  assert.match(productionMode, /x-johnsweber-use-production/);
  assert.match(demoMedia, /Api-User-Agent/);
  assert.match(demoMedia, /JohnsweberDemoMedia/);
  assert.match(demoMedia, /copyDemoAssetToR2/);
  assert.match(demoMedia, /demoLicense/);
  assert.match(aiVideo, /Demo mode returns a free example video/);
  assert.match(aiVideo, /useProduction && videoModel\.supportsImage/);
  assert.match(aiVideo, /readApiResponse/);
  assert.match(aiVideo, /unreadable response/);
});

test("normalizes structured Modal responses before D1 writes", async () => {
  const source = await readFile(
    new URL(
      "../app/api/experiments/ai-video/jobs/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /function modalString/);
  assert.match(source, /function modalErrorMessage/);
  assert.match(source, /resultPath\?\.split/);
  assert.match(source, /modal_call_id: callId/);
  assert.match(source, /num_inference_steps: inferenceSteps/);
  assert.match(source, /video_crf: videoCrf/);
  assert.match(source, /frame_rate: fps/);
  assert.match(source, /browser upload could not be read/);
  assert.match(source, /body: JSON\.stringify\(payload\)/);
  assert.match(source, /referenceMedia\.content_object_key/);
  assert.match(source, /The reference picture is unavailable/);
});

test("supports saved last frames, extendable scenes, and CPU exports", async () => {
  const app = await readFile(
    new URL("../app/experiments/ai-video/ai-video-app.tsx", import.meta.url),
    "utf8",
  );
  const database = await readFile(new URL("../db/ai-video.ts", import.meta.url), "utf8");
  const processing = await readFile(
    new URL("../lib/ai-video-processing.ts", import.meta.url),
    "utf8",
  );
  const videoService = await readFile(
    new URL("../lib/ai-video-service.ts", import.meta.url),
    "utf8",
  );
  const processingSource = await readFile(
    new URL("../app/api/experiments/ai-video/processing/[taskId]/source/[mediaId]/route.ts", import.meta.url),
    "utf8",
  );
  const modal = await readFile(new URL("../modal_media_tools.py", import.meta.url), "utf8");
  const exportRoute = await readFile(
    new URL("../app/api/experiments/ai-video/scenes/[id]/export/route.ts", import.meta.url),
    "utf8",
  );
  const sceneRoute = await readFile(
    new URL("../app/api/experiments/ai-video/scenes/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const browserFrameRoute = await readFile(
    new URL("../app/api/experiments/ai-video/media/[id]/last-frame/route.ts", import.meta.url),
    "utf8",
  );
  const queueRoute = await readFile(
    new URL("../app/api/experiments/ai-video/queue/route.ts", import.meta.url),
    "utf8",
  );
  const cancelRoute = await readFile(
    new URL("../app/api/experiments/ai-video/queue/cancel/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /Extend video/);
  assert.match(app, /Reference image/);
  assert.match(app, /Previewing the saved frame/);
  assert.match(app, /function SceneView/);
  assert.match(app, /onLoadedMetadata/);
  assert.match(app, /durationSeconds: duration/);
  assert.match(app, /function ScannableVideo/);
  assert.match(app, /Scan timeline/);
  assert.match(app, /toDataURL\("image\/jpeg"/);
  assert.match(app, /Math\.ceil\(measuredDuration \/ 3\)/);
  assert.match(app, /canvas\.toBlob/);
  assert.match(app, /Preparing the last frame on the server/);
  assert.match(app, /onPointerMove=\{handlePointerMove\}/);
  assert.match(app, /Export scene/);
  assert.match(app, /href: "\/experiments\/ai-video\/queue"/);
  assert.match(app, /function QueueView/);
  assert.match(app, /All processes/);
  assert.match(app, /Cancelling\.\.\./);
  assert.match(app, /Add from library/);
  assert.match(app, /Save scene/);
  assert.match(app, /preload="auto"/);
  assert.match(app, /Promise\.all\(playable\.map/);
  assert.match(app, /mediaIds: items\.map/);
  assert.match(app, /window\.location\.assign\(`\/experiments\/ai-video\/media\/\$\{task\.outputMediaId\}`\)/);
  assert.match(app, /Opening the merged video/);
  assert.match(app, /Your preview is in motion/);
  assert.match(app, /aiv-generation-reference/);
  assert.match(app, /job\?\.progress \|\| 4/);
  assert.match(app, /GENERATION STOPPED/);
  assert.match(app, /aiv-processing-warning/);
  assert.match(app, /Retrying automatically/);
  assert.match(videoService, /failVideoJob/);
  assert.match(videoService, /result\.output_id/);
  assert.match(videoService, /nextRetryState/);
  assert.match(database, /ai_video_scene_items/);
  assert.match(database, /replaceAiVideoSceneItems/);
  assert.match(database, /AS effective_status/);
  assert.match(database, /clip\.status IN \('submitted', 'pending'\)/);
  assert.match(database, /last_frame_object_key/);
  assert.match(processing, /scene_export/);
  assert.match(modal, /ffmpeg/);
  assert.match(modal, /merge_videos/);
  assert.match(modal, /format=duration/);
  assert.match(modal, /Range/);
  assert.match(modal, /range\(4\)/);
  assert.match(processingSource, /Content-Range/);
  assert.match(browserFrameRoute, /processingEndpoint/);
  assert.match(browserFrameRoute, /task_type: "last_frame"/);
  assert.match(browserFrameRoute, /\/last-frame/);
  assert.doesNotMatch(browserFrameRoute, /request\.formData/);
  assert.match(modal, /volume\.reload\(\)/);
  assert.match(modal, /"-update", "1"/);
  assert.match(modal, /cancel\.aio\(\)/);
  assert.match(queueRoute, /listProcessingTasks/);
  assert.match(queueRoute, /remainingSeconds/);
  assert.match(cancelRoute, /Cancelled by user\./);
  assert.match(cancelRoute, /\/cancel\/\$\{encodeURIComponent\(callId\)\}/);
  assert.match(sceneRoute, /export async function PATCH/);
  assert.match(sceneRoute, /replaceAiVideoSceneItems/);
  assert.match(exportRoute, /Wait for every scene video to finish/);
  assert.doesNotMatch(exportRoute, /requestUsesProduction|demoAssetFor/);
});

test("reconciles provider work with bounded retry and terminal policies", async () => {
  assert.equal(providerResponseDisposition(202), "ok");
  assert.equal(providerResponseDisposition(404), "terminal");
  assert.equal(providerResponseDisposition(429), "retry");
  assert.equal(providerResponseDisposition(503), "retry");
  assert.equal(
    shouldReconcileJob({
      status: "running",
      modal_result_path: "/result/test",
      output_object_key: null,
    }),
    true,
  );
  assert.equal(
    shouldReconcileJob({
      status: "running",
      modal_result_path: "/result/test",
      output_object_key: "stored.mp4",
    }),
    false,
  );
  assert.equal(
    shouldReconcileTask({ status: "pending", modal_result_path: "/result/task" }),
    true,
  );
  const retry = nextRetryState(MAX_PROVIDER_RETRIES - 1, "temporary outage");
  assert.equal(retry.terminal, true);
  assert.equal(retry.retryCount, MAX_PROVIDER_RETRIES);
  assert.match(retry.message, /stopped after 12 attempts/i);

  const worker = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  const reconciler = await readFile(
    new URL("../lib/ai-video-reconciler.ts", import.meta.url),
    "utf8",
  );
  const queue = await readFile(
    new URL("../app/api/experiments/ai-video/queue/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /async scheduled/);
  assert.match(worker, /reconcileAiVideoWork/);
  assert.match(reconciler, /acquireAiVideoReconcilerLease/);
  assert.match(reconciler, /Promise\.allSettled/);
  assert.match(reconciler, /hasActiveGpuWorkForModel/);
  assert.match(queue, /lastProviderContactAt/);
  assert.match(queue, /gpuShutdownStatus/);
});
