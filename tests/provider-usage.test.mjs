import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { recordOpenAIUsage, summarizeOpenAIUsage } from "../lib/provider-usage.ts";

test("provider usage includes cached input, reasoning, searches, and dated pricing", () => {
  const usage = summarizeOpenAIUsage({
    id: "resp_usage",
    output: [
      { type: "web_search_call", action: { type: "search" } },
      { type: "web_search_call", action: { type: "open_page" } },
    ],
    usage: {
      input_tokens: 10_000,
      input_tokens_details: { cached_tokens: 2_000 },
      output_tokens: 1_500,
      output_tokens_details: { reasoning_tokens: 500 },
      total_tokens: 11_500,
    },
  }, "gpt-5.6-luna");

  assert.equal(usage.providerResponseId, "resp_usage");
  assert.equal(usage.cachedInputTokens, 2_000);
  assert.equal(usage.reasoningTokens, 500);
  assert.equal(usage.webSearchCalls, 2);
  assert.equal(usage.pageFetches, 1);
  assert.equal(usage.estimatedCostUsd, 0.0372);
  assert.equal(usage.rateEffectiveAt, "2026-07-13");
});

test("provider usage persists purpose, outcome, dimensions, and safe metadata", async () => {
  const writes = [];
  env.DB = {
    prepare(sql) {
      return {
        bind(...input) {
          return {
            run: async () => {
              writes.push({ statement: sql, values: input });
              return { success: true };
            },
          };
        },
      };
    },
  };
  try {
    await recordOpenAIUsage({
      identityId: "identity-usage",
      modelId: "gpt-5.4-nano",
      operation: "starter_generation",
      purpose: "manual_refresh",
      outcome: "completed",
      response: {
        id: "resp_usage_write",
        output: [{ type: "web_search_call" }],
        usage: { input_tokens: 400, output_tokens: 200, total_tokens: 600 },
      },
      providerRequestId: "req_usage_write",
      httpStatus: 200,
      latencyMs: 123,
      metadata: { performerId: "sage", forcedRefresh: true },
    });
    const [{ statement, values }, cleanup] = writes;
    assert.match(statement, /INSERT INTO provider_usage_events/);
    assert.equal((statement.match(/\?/g) ?? []).length, 26);
    assert.equal(values.length, 26);
    assert.equal(values[1], "identity-usage");
    assert.equal(values[5], "gpt-5.4-nano");
    assert.equal(values[6], "starter_generation");
    assert.equal(values[7], "manual_refresh");
    assert.equal(values[8], "completed");
    assert.equal(values[9], "resp_usage_write");
    assert.equal(values[10], "req_usage_write");
    assert.equal(values[17], 1);
    assert.deepEqual(JSON.parse(values[24]), { performerId: "sage", forcedRefresh: true });
    assert.match(cleanup.statement, /DELETE FROM provider_usage_events WHERE created_at < \?/);
    assert.equal(cleanup.values.length, 1);
  } finally {
    delete env.DB;
  }
});
