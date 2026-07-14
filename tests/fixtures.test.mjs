import assert from "node:assert/strict";
import test from "node:test";
import { MODELS } from "../lib/catalog.ts";
import { buildFixtureTurn } from "../lib/fixtures.ts";

const input = {
  question: "What does a building sound like?",
  depth: 0,
  performerId: "sage",
};

test("publishes only selectable live OpenAI research models", () => {
  assert.equal(MODELS.length, 7);
  assert.ok(MODELS.every((model) => model.provider === "OpenAI" && model.mode === "live"));
  assert.ok(MODELS.some((model) => model.id === "gpt-5.4-nano"));
  assert.ok(!MODELS.some((model) => model.id === "fixture-terra"));
});

test("fixture turn is deterministic and returns exactly two distinct paths", () => {
  const first = buildFixtureTurn(input);
  const second = buildFixtureTurn(input);

  assert.deepEqual(first, second);
  assert.equal(first.options.length, 2);
  assert.notEqual(first.options[0].question, first.options[1].question);
  assert.equal(first.sources.length, 3);
  assert.equal(first.researchEvents.length, 5);
  assert.ok(first.answerBlocks.every((block) => block.sourceIds.length > 0));
});

test("rejecting both paths produces a replacement pair", () => {
  const original = buildFixtureTurn(input);
  const replacement = buildFixtureTurn({
    ...input,
    rejectionCount: 1,
    adventure: 80,
  });

  assert.equal(replacement.options.length, 2);
  assert.notDeepEqual(replacement.options, original.options);
});
