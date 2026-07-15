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
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json(starterPayload(providerCalls), {
      headers: { "x-request-id": `req_starters_${providerCalls}` },
    });
  };

  const viewer = { identityId: "identity-starters", mode: "guest" };
  try {
    const initial = await getPersonalizedStarters(viewer, "sage");
    const cachedAgain = await getPersonalizedStarters(viewer, "sage");
    assert.equal(providerCalls, 1);
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
