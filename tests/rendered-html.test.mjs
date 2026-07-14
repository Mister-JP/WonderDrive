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
      throw new Error("The public Phase 1 render must not query D1 before client hydration");
    },
  },
};

const context = {
  waitUntil() {},
  passThroughOnException() {},
};

test("server-renders the honest WonderDrive Phase 1 product shell", async () => {
  const app = await worker();
  const response = await app.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    env,
    context,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>WonderDrive — Give curiosity a direction<\/title>/i);
  assert.match(html, /Give curiosity/i);
  assert.match(html, /exactly two/i);
  assert.match(html, /Phase 1/i);
  assert.match(html, /no AI or live web request yet/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("exposes an explicit Phase 1 health contract", async () => {
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
    phase: 1,
    capabilities: {
      publicShell: true,
      serverRoutes: true,
      d1Declared: true,
      durableJourneys: true,
      guestIdentity: true,
      deterministicResearchFixture: true,
      liveResearch: false,
    },
  });
});
