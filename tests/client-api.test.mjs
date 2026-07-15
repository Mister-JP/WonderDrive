import assert from "node:assert/strict";
import test from "node:test";
import { starterRecommendationsUrl, streamLiveResearch } from "../app/client-api.ts";

test("starter recommendations use cache unless a person explicitly refreshes", () => {
  assert.equal(starterRecommendationsUrl("sage"), "/api/starters?performer=sage");
  assert.equal(
    starterRecommendationsUrl("mechanist", true),
    "/api/starters?performer=mechanist&refresh=1",
  );
});

test("live research makes automatic retries visible and clears stale activity", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });

  const frames = [
    { type: "started", requestId: "diagnostic-1", question: "Why?", message: "Started" },
    { type: "activity", event: { id: "old", sequence: 1, kind: "search", label: "Searching", sourceId: null } },
    { type: "retry", attempt: 1, maxRetries: 5, message: "Temporary research failure. Automatic retry 1 of 5 will begin shortly." },
    { type: "complete", data: { id: "journey-1" }, viewer: { mode: "guest" } },
  ];
  const body = frames.map((frame) => `data: ${JSON.stringify(frame)}\n\n`).join("");
  globalThis.fetch = async () => new Response(body, {
    status: 200,
    headers: { "content-type": "text/event-stream" },
  });

  let state = {
    question: "Initial",
    performerId: "sage",
    message: "Connecting",
    events: [],
    status: "running",
    result: null,
    error: null,
    diagnosticId: null,
    retryAttempt: 0,
    maxRetries: 0,
  };
  const setState = (update) => {
    state = typeof update === "function" ? update(state) : update;
  };

  await streamLiveResearch({ kind: "create", idempotencyKey: "request-key" }, setState);

  assert.equal(state.message, "Temporary research failure. Automatic retry 1 of 5 will begin shortly.");
  assert.equal(state.diagnosticId, "diagnostic-1");
  assert.equal(state.retryAttempt, 1);
  assert.equal(state.maxRetries, 5);
  assert.deepEqual(state.events, []);
});
