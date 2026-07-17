import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { getPersonalizedStarters } from "../lib/starter-recommendations.ts";

function starterPayload(generation) {
  return {
    id: `resp_starters_${generation}`,
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          starters: Array.from({ length: 20 }, (_, index) => ({
            question: `Could generation ${generation} mystery ${index + 1} reveal something surprising?`,
            topic: `topic ${generation}-${index + 1}`,
          })),
        }),
      }],
    }],
    usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 },
  };
}

test("starter cache lasts until expiry and explicit refresh replaces it", async () => {
  const originalFetch = globalThis.fetch;
  let cached = null;
  let providerCalls = 0;
  let analyticsWrites = 0;
  const requests = [];
  env.OPENAI_API_KEY = "test-key";
  env.DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...input) {
          values = input;
          return this;
        },
        async first() {
          if (!sql.includes("FROM starter_recommendations")) return null;
          if (!cached || cached.expiresAt <= values[2]) return null;
          return { questions_json: cached.questionsJson };
        },
        async all() {
          return { results: [] };
        },
        async run() {
          if (sql.includes("INSERT INTO starter_recommendations")) {
            cached = { questionsJson: values[2], expiresAt: values[4] };
          }
          if (sql.includes("INSERT INTO provider_usage_events")) analyticsWrites += 1;
          return { success: true };
        },
      };
    },
  };
  globalThis.fetch = async (_url, init) => {
    providerCalls += 1;
    requests.push(JSON.parse(init.body));
    return Response.json(starterPayload(providerCalls), {
      headers: { "x-request-id": `req_starters_${providerCalls}` },
    });
  };

  const viewer = { identityId: "identity-starters", mode: "guest" };
  try {
    const initial = await getPersonalizedStarters(viewer, "sage");
    const cachedAgain = await getPersonalizedStarters(viewer, "sage");
    assert.equal(providerCalls, 1);
    assert.equal(requests[0].max_output_tokens, 6_000);
    assert.deepEqual(requests[0].reasoning, { effort: "high" });
    assert.deepEqual(cachedAgain, initial);
    assert.ok(cached.expiresAt >= Date.now() + 86_300_000);

    const refreshed = await getPersonalizedStarters(viewer, "sage", { refresh: true });
    assert.equal(providerCalls, 2);
    assert.notDeepEqual(refreshed, initial);
    assert.equal(analyticsWrites, 2);

    const refreshedFromCache = await getPersonalizedStarters(viewer, "sage");
    assert.equal(providerCalls, 2);
    assert.deepEqual(refreshedFromCache, refreshed);
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});

test("starter generation records incomplete output and returns the safe fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  let analyticsWrites = 0;
  env.OPENAI_API_KEY = "test-key";
  env.DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async first() { return null; },
        async all() { return { results: [] }; },
        async run() {
          if (sql.includes("INSERT INTO provider_usage_events")) analyticsWrites += 1;
          return { success: true };
        },
      };
    },
  };
  globalThis.fetch = async () => Response.json({
    id: "resp_starters_incomplete",
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [],
    usage: {
      input_tokens: 100,
      output_tokens: 6_000,
      total_tokens: 6_100,
      output_tokens_details: { reasoning_tokens: 6_000 },
    },
  });
  console.error = () => {};

  try {
    const starters = await getPersonalizedStarters(
      { identityId: "identity-incomplete", mode: "guest" },
      "sage",
    );
    assert.equal(starters.length, 24);
    assert.equal(analyticsWrites, 1);
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});
