import assert from "node:assert/strict";
import test from "node:test";

async function worker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  return (await import(workerUrl.href)).default;
}

const env = {
  ASSETS: {
    fetch: async () => new Response("Not found", { status: 404 }),
  },
  DB: {
    prepare() {
      throw new Error("The public Phase 0 render must not query D1");
    },
  },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("server-renders the honest WonderDrive Phase 0 shell", async () => {
  const app = await worker();
  const response = await app.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    env,
    context,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>WonderDrive — Follow the question<\/title>/i);
  assert.match(html, /Follow one question/i);
  assert.match(html, /exactly two/i);
  assert.match(html, /Phase 0/i);
  assert.match(html, /intentionally makes no AI request/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("exposes an explicit Phase 0 health contract", async () => {
  const app = await worker();
  const response = await app.fetch(
    new Request("http://localhost/api/health"),
    env,
    context,
  );

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    product: "WonderDrive",
    phase: 0,
    capabilities: {
      publicShell: true,
      serverRoutes: true,
      d1Declared: true,
      liveResearch: false,
    },
  });
});
