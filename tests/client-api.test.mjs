import assert from "node:assert/strict";
import test from "node:test";
import { api, streamLiveResearch } from "../app/client-api.ts";
import { clearSessionOpenAIKey, writeSessionOpenAIKey } from "../app/byok-client.ts";

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
    errorCode: null,
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

test("client API preserves quota error codes for targeted recovery", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({
    error: {
      code: "LIVE_RESEARCH_LIMIT",
      message: "The rolling live research limit is reached.",
      retryable: true,
    },
  }, { status: 429 });

  await assert.rejects(
    () => api("/api/usage"),
    (error) => error?.code === "LIVE_RESEARCH_LIMIT" && error?.retryable === true,
  );
});

test("live admission errors preserve the identity-scoped takeover target", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({
    error: {
      code: "ALREADY_IN_PROGRESS",
      message: "Another foreground request is active.",
      retryable: true,
      diagnosticId: "request-active",
    },
  }, { status: 409 });

  await assert.rejects(
    () => streamLiveResearch({ kind: "create", idempotencyKey: "request-key" }, () => {}),
    (error) => error?.code === "ALREADY_IN_PROGRESS"
      && error?.diagnosticId === "request-active",
  );
});

test("BYOK is attached only to provider-backed same-origin API calls", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalWindow = globalThis.window;
  const values = new Map();
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
      removeItem: (key) => values.delete(key),
    },
  };
  const requests = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url, headers: new Headers(init?.headers) });
    return Response.json({ data: {}, viewer: { mode: "guest" } });
  };
  context.after(() => {
    clearSessionOpenAIKey();
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });

  writeSessionOpenAIKey("sk-test-browser-session-key-long-enough");
  await api("/api/usage");
  await api("/api/research/background");

  assert.equal(requests[0].headers.get("x-curiositypedia-openai-key"), null);
  assert.equal(
    requests[1].headers.get("x-curiositypedia-openai-key"),
    "sk-test-browser-session-key-long-enough",
  );
});
