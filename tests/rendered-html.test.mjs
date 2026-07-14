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

test("server-renders the honest WonderDrive V3 product shell", async () => {
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
  assert.match(html, /Research first/i);
  assert.match(html, /same selected model researches and performs/i);
  assert.match(html, /durable branching graph/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Starter Project/i);
});

test("exposes an explicit V3 health contract", async () => {
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
    phase: 3,
    capabilities: {
      publicShell: true,
      serverRoutes: true,
      d1Declared: true,
      durableJourneys: true,
      guestIdentity: true,
      deterministicResearchFixture: true,
      liveForegroundResearch: true,
      openAIResponses: true,
      webSearch: true,
      structuredOutputValidation: true,
      usageAccounting: true,
      modelRegistry: true,
      performerContracts: true,
      preferences: true,
      journeySnapshots: true,
      journeyExport: true,
      deliberateGuestUpgrade: true,
      costGuardrails: true,
      backgroundJobs: false,
    },
  });
});
