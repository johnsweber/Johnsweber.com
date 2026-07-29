import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.doesNotMatch(source, /sourceMode|Generate source locally/);
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
  const modal = await readFile(new URL("../modal_media_tools.py", import.meta.url), "utf8");
  const exportRoute = await readFile(
    new URL("../app/api/experiments/ai-video/scenes/[id]/export/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(app, /Extend video/);
  assert.match(app, /function SceneView/);
  assert.match(app, /Export scene/);
  assert.match(database, /ai_video_scene_items/);
  assert.match(database, /last_frame_object_key/);
  assert.match(processing, /scene_export/);
  assert.match(modal, /ffmpeg/);
  assert.match(modal, /merge_videos/);
  assert.doesNotMatch(exportRoute, /requestUsesProduction|demoAssetFor/);
});
