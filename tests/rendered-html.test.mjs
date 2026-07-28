import assert from "node:assert/strict";
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
  assert.match(html, /Your account space is ready/);
  assert.match(html, /View login/);
});
