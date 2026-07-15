import assert from "node:assert/strict";
import test from "node:test";
import { diagnosticsTestHooks, getDiagnostics } from "../lib/diagnostics.ts";

test("diagnostics expose stream metadata without prompts or response text", () => {
  const incident = diagnosticsTestHooks.mapIncident(
    {
      id: "0f56bcb8-2e6b-4c5f-88b7-37af79cb2dd9",
      kind: "create",
      request_json: JSON.stringify({
        question: "private question",
        modelId: "gpt-5.4-nano",
        researchPreset: "standard",
      }),
      error_code: "PROVIDER_ERROR",
      error_message: "The provider stream ended without a terminal event.",
      created_at: 100,
      completed_at: 250,
    },
    {
      research_request_id: "0f56bcb8-2e6b-4c5f-88b7-37af79cb2dd9",
      provider_response_id: null,
      provider_request_id: "req_provider",
      http_status: 200,
      latency_ms: 150,
      metadata_json: JSON.stringify({
        stage: "missing_terminal_event",
        lastProviderEventType: "response.output_text.delta",
        providerEventCount: 42,
        malformedEventCount: 1,
        outputDeltaCount: 12,
        sawProviderDone: false,
      }),
      created_at: 250,
    },
  );

  assert.equal(incident.modelId, "gpt-5.4-nano");
  assert.equal(incident.stage, "missing_terminal_event");
  assert.equal(incident.providerRequestId, "req_provider");
  assert.equal(incident.providerEventCount, 42);
  assert.equal(incident.malformedEventCount, 1);
  assert.doesNotMatch(JSON.stringify(incident), /private question/);
});

test("guest diagnostics require a signed-in identity", async () => {
  await assert.rejects(
    () => getDiagnostics({
      identityId: "guest-id",
      mode: "guest",
      displayName: "Guest explorer",
      journeyLimit: 5,
    }),
    (error) => error?.code === "AUTH_REQUIRED" && error?.status === 401,
  );
});
