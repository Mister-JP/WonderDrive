import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
  markProviderCostUncertain,
  providerCostControlTestHooks,
  reserveProviderCost,
  settleProviderCost,
} from "../lib/provider-cost-control.ts";

test("builds a conservative envelope from request bytes and server call limits", () => {
  const body = {
    model: "gpt-5.4-nano",
    input: "bounded input",
    max_output_tokens: 4_000,
    max_tool_calls: 2,
  };
  const envelope = providerCostControlTestHooks.costEnvelope(body, "gpt-5.4-nano");
  const bodyBytes = new TextEncoder().encode(JSON.stringify(body)).byteLength;
  assert.equal(envelope.inputTokenUpperBound, bodyBytes);
  assert.equal(envelope.maxOutputTokens, 4_000);
  assert.equal(envelope.maxToolCalls, 2);
  assert.equal(
    envelope.reservedMicrousd,
    Math.ceil(bodyBytes * 0.2 + 4_000 * 1.25 + 2 * 0.01 * 1_000_000),
  );
});

test("treats a zero-change conditional insert as an atomic budget denial", async () => {
  env.OPENAI_API_KEY = "test-key";
  let insertCount = 0;
  let reservationSql = "";
  env.DB = {
    prepare(sql) {
      reservationSql = sql;
      return {
        bind() { return this; },
        async run() {
          insertCount += 1;
          return { success: true, meta: { changes: insertCount === 1 ? 1 : 0 } };
        },
      };
    },
  };
  const input = {
    identityId: "identity-atomic",
    viewerMode: "guest",
    modelId: "gpt-5.4-nano",
    operation: "starter_generation",
    requestBody: { model: "gpt-5.4-nano", max_output_tokens: 100 },
  };
  try {
    const admitted = await reserveProviderCost({ ...input, callKey: "atomic:first" });
    assert.ok(admitted.id);
    await assert.rejects(
      () => reserveProviderCost({ ...input, callKey: "atomic:second" }),
      (error) => error?.code === "BUDGET_EXCEEDED" && error?.status === 429,
    );
    assert.match(reservationSql, /^INSERT INTO provider_cost_reservations/);
    assert.match(reservationSql, /FROM provider_cost_reservations/);
    assert.match(reservationSql, /identity_id = \? AND window_started_at >= \?/);
  } finally {
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});

test("settles known cost and keeps ambiguous outcomes at the full hold", async () => {
  const writes = [];
  env.DB = {
    prepare(sql) {
      let values = [];
      return {
        bind(...input) { values = input; return this; },
        async run() { writes.push({ sql, values }); return { success: true, meta: { changes: 1 } }; },
      };
    },
  };
  try {
    await settleProviderCost("reservation-known", 12_345, "provider-known");
    await markProviderCostUncertain("reservation-unknown", "provider-unknown");
    assert.match(writes[0].sql, /status = 'settled'/);
    assert.equal(writes[0].values[0], 12_345);
    assert.match(writes[1].sql, /status = 'uncertain'/);
    assert.ok(!writes[1].sql.includes("settled_microusd = 0"));
  } finally {
    delete env.DB;
  }
});

test("BYOK validates model access without consuming or reserving application funds", async () => {
  delete env.OPENAI_API_KEY;
  let databaseTouched = false;
  env.DB = {
    prepare() {
      databaseTouched = true;
      throw new Error("BYOK must not create an application-funded reservation");
    },
  };
  try {
    const reservation = await reserveProviderCost({
      callKey: "byok:research",
      identityId: "guest-byok",
      viewerMode: "guest",
      modelId: "gpt-5.4-nano",
      operation: "live_research",
      requestBody: { model: "gpt-5.4-nano", max_output_tokens: 100 },
      providerAuth: { funding: "user", apiKey: "sk-test-byok-credential-long-enough" },
    });
    assert.deepEqual(reservation, { id: null, reservedMicrousd: 0 });
    assert.equal(databaseTouched, false);
  } finally {
    delete env.DB;
  }
});
