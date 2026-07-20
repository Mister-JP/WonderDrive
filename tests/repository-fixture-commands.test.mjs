import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { MODELS } from "../lib/catalog.ts";
import { createJourney } from "../lib/repository.ts";

const viewer = {
  identityId: "identity-owner",
  mode: "chatgpt",
  displayName: "Owner",
  journeyLimit: 20,
};

const request = {
  seed: "Why do fireflies glow?",
  performerId: "sage",
  modelId: "gpt-5.6-terra",
  researchPreset: "standard",
  answerDensity: "balanced",
  outputLocale: "en",
  idempotencyKey: "fixture-create-characterization",
};

test("fixture creation is unreachable under the current model catalog before any D1 access", async () => {
  let prepareCalls = 0;
  env.DB = {
    prepare() {
      prepareCalls += 1;
      throw new Error("Fixture create validation should finish before D1 access.");
    },
  };

  assert.ok(MODELS.length > 0);
  assert.ok(MODELS.every((model) => model.mode === "live"));
  for (const model of MODELS) {
    await assert.rejects(
      () => createJourney(viewer, { ...request, modelId: model.id }),
      (error) => error?.code === "BAD_REQUEST"
        && error?.status === 400
        && error?.message === "Live models must use the foreground research route.",
    );
  }
  await assert.rejects(
    () => createJourney(viewer, { ...request, modelId: "fixture-terra" }),
    (error) => error?.code === "BAD_REQUEST"
      && error?.status === 400
      && error?.message === "Choose a supported demo model.",
  );
  assert.equal(prepareCalls, 0);
});
