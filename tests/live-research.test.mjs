import assert from "node:assert/strict";
import test from "node:test";
import { liveResearchTestHooks } from "../lib/live-research.ts";

const providerResponse = {
  output: [
    {
      type: "web_search_call",
      action: {
        sources: [
          {
            title: "Primary evidence",
            url: "https://example.org/evidence?utm_source=test",
          },
          {
            title: "Independent context",
            url: "https://research.example.net/context",
          },
          {
            title: "Duplicate evidence",
            url: "https://example.org/evidence",
          },
        ],
      },
    },
  ],
};

const validTurn = {
  topicLabel: "evidence systems",
  answerBlocks: [
    {
      text: "The first part of this researched performance is deliberately long enough to satisfy WonderDrive’s answer contract and make one supported claim.",
      citationUrls: ["https://example.org/evidence"],
    },
    {
      text: "The second part cross-checks that claim against another returned source, preserving the difference between evidence and the performer’s framing.",
      citationUrls: ["https://research.example.net/context"],
    },
  ],
  transition:
    "The evidence leaves two useful directions: investigate the mechanism or challenge the boundary.",
  researchSummary:
    "Searched for primary evidence, compared an independent source, and checked citation membership.",
  researchHandoff: {
    discoveries: ["The evidence supports a repeatable pattern."],
    uncertainties: ["The boundary conditions remain uncertain."],
    unresolvedThreads: ["Test the mechanism in a different setting."],
    sourceLeads: ["https://example.org/evidence", "https://research.example.net/context"],
  },
  preferredPosition: 0,
  options: [
    { question: "Which mechanism makes this pattern repeat over time?", angle: "mechanism" },
    { question: "Whose evidence would change the frame most?", angle: "perspective" },
  ],
};

test("normalizes and deduplicates provider-returned web sources", () => {
  const sources = liveResearchTestHooks.extractSources(providerResponse);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, "https://example.org/evidence");
  assert.equal(sources[1].publisher, "research.example.net");
});

test("accepts only citations that belong to the provider source set", () => {
  const sources = liveResearchTestHooks.extractSources(providerResponse);
  const mapped = liveResearchTestHooks.validateAndMapTurn(validTurn, sources);

  assert.equal(mapped.options.length, 2);
  assert.notEqual(mapped.options[0].question, mapped.options[1].question);
  assert.equal(mapped.answerBlocks.length, 2);
  assert.ok(mapped.answerBlocks.every((block) => block.sourceIds.length === 1));
  assert.equal(mapped.sources.filter((source) => source.relation === "cited").length, 2);
});

test("rejects a citation URL that web search did not return", () => {
  const sources = liveResearchTestHooks.extractSources(providerResponse);
  const invalid = structuredClone(validTurn);
  invalid.answerBlocks[0].citationUrls = ["https://unseen.example.com/claim"];
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(
      () => liveResearchTestHooks.validateAndMapTurn(invalid, sources),
      (error) => error?.code === "CITATION_INVALID",
    );
  } finally {
    console.error = originalError;
  }
});
