import assert from "node:assert/strict";
import test from "node:test";
import { performerById } from "../lib/catalog.ts";
import { liveRedrawTestHooks } from "../lib/live-redraw.ts";
import { OPENAI_PROMPT_LIMITS, responseIncompleteReason } from "../lib/openai.ts";

const turn = {
  topicLabel: "Fiber optics",
  answerBlocks: [{ text: "Light travels through a glass core by total internal reflection." }],
  media: [],
  metadata: { outputLocale: "en" },
};

const input = {
  identityId: "identity-1",
  journeyId: "journey-1",
  turn,
  performerId: "mechanist",
  modelId: "gpt-5.6-luna",
  rejectedQuestions: ["Where are fiber-optic cables installed?"],
  adventure: 78,
  reason: "I want a question explaining what total internal reflection is and how it works.",
};

test("makes the learner's redraw note authoritative and permits foundational concept questions", () => {
  const instructions = liveRedrawTestHooks.buildRedrawInstructions(input, performerById("mechanist"));
  assert.match(instructions, /learnerDirection field is the learner's explicit editorial request/);
  assert.match(instructions, /highest-priority direction/);
  assert.match(instructions, /concept, definition, foundational idea, or mechanism/);
  assert.match(instructions, /at least one replacement question must directly express that request/);
  assert.match(instructions, /Questions such as 'What is this\?'/);
  assert.match(instructions, /Do not turn a direct learner request into a merely adjacent/);
});

test("sends the note as learnerDirection and explains the adventure scale", () => {
  const payload = liveRedrawTestHooks.buildRedrawInput(input);
  assert.equal(payload.learnerDirection, input.reason);
  assert.match(payload.defaultAdventureDirection, /^Surprising:/);
  assert.match(liveRedrawTestHooks.adventureDirection(20), /^Practical:/);
  assert.match(liveRedrawTestHooks.adventureDirection(50), /^Different direction:/);
});

test("keeps enough output allowance for reasoning and structured redraw output", () => {
  assert.equal(OPENAI_PROMPT_LIMITS.questionRedraw.reasoning, "high");
  assert.equal(OPENAI_PROMPT_LIMITS.questionRedraw.maxOutputTokens, 4_000);
});

test("recognizes incomplete Responses API output across prompt paths", () => {
  assert.equal(responseIncompleteReason({
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
  }), "max_output_tokens");
  assert.equal(responseIncompleteReason({
    status: "completed",
    incomplete_details: null,
  }), null);
  assert.equal(responseIncompleteReason({
    status: "incomplete",
    incomplete_details: { reason: "content_filter" },
  }), "content_filter");
});

test("allocates scaled reasoning and output budgets to every prompt path", () => {
  assert.deepEqual(OPENAI_PROMPT_LIMITS.liveResearch, {
    spark: { maxToolCalls: 3, maxOutputTokens: 10_000, reasoning: "low", timeoutMs: 60_000 },
    standard: { maxToolCalls: 8, maxOutputTokens: 18_000, reasoning: "medium", timeoutMs: 150_000 },
    deep: { maxToolCalls: 12, maxOutputTokens: 26_000, reasoning: "high", timeoutMs: 180_000 },
  });
  assert.deepEqual(OPENAI_PROMPT_LIMITS.starterGeneration, { maxOutputTokens: 6_000, reasoning: "high" });
  assert.deepEqual(OPENAI_PROMPT_LIMITS.imageNoteRepair, { maxOutputTokens: 3_000, reasoning: "medium", timeoutMs: 30_000 });
  assert.deepEqual(OPENAI_PROMPT_LIMITS.citationRepair, { maxOutputTokens: 2_000, reasoning: "medium", timeoutMs: 30_000 });
  assert.deepEqual(OPENAI_PROMPT_LIMITS.citationRecovery, { maxOutputTokens: 6_000, reasoning: "high", timeoutMs: 60_000 });
});
