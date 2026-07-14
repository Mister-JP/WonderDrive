import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { liveResearchTestHooks, runLiveResearch } from "../lib/live-research.ts";

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
  media: {
    available: false,
    imageUrl: "",
    sourcePageUrl: "",
    caption: "",
    alt: "",
  },
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

test("extracts image search results into a graceful media gallery", () => {
  const response = {
    output: [{
      type: "web_search_call",
      results: [
        {
          type: "image_result",
          image_url: "https://images.example.org/bridge.jpg",
          thumbnail_url: "https://images.example.org/bridge-thumb.jpg",
          source_website_url: "https://example.org/bridge",
          caption: "A suspension bridge showing its main cables.",
        },
        {
          type: "image_result",
          image_url: "https://images.example.org/joint.jpg",
          source_website_url: "https://example.org/joints",
          caption: "A close view of an expansion joint.",
        },
      ],
    }],
  };
  const images = liveResearchTestHooks.extractImages(response);
  const mapped = liveResearchTestHooks.validateAndMapTurn(
    validTurn,
    liveResearchTestHooks.extractSources(providerResponse),
    "prefer",
    images,
  );

  assert.equal(mapped.media.length, 2);
  assert.equal(mapped.media[0].thumbnailUrl, "https://images.example.org/bridge-thumb.jpg");
  assert.ok(mapped.sources.some((source) => source.relation === "image"));
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

test("rejects an overlong next-question rabbit hole", () => {
  const sources = liveResearchTestHooks.extractSources(providerResponse);
  const overlong = structuredClone(validTurn);
  overlong.options[0].question = `${"Why does this surprising detail need another complicated explanation ".repeat(3)}?`;
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(
      () => liveResearchTestHooks.validateAndMapTurn(overlong, sources),
      (error) => error?.code === "SCHEMA_INVALID",
    );
  } finally {
    console.error = originalError;
  }
});

test("accepts harmless citation URL aliases without using domain-only matching", () => {
  const sources = liveResearchTestHooks.extractSources({
    output: [{
      type: "web_search_call",
      action: { sources: [{ title: "Aliased evidence", url: "https://www.example.org/evidence/" }] },
    }],
  });
  const aliased = structuredClone(validTurn);
  aliased.answerBlocks[0].citationUrls = ["http://example.org/evidence?utm_source=model"];
  aliased.answerBlocks[1].citationUrls = ["https://example.org/different-article"];
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(
      () => liveResearchTestHooks.validateAndMapTurn(aliased, sources),
      (error) => error?.code === "CITATION_INVALID",
    );
    aliased.answerBlocks[1].citationUrls = ["https://www.example.org/evidence/"];
    assert.equal(liveResearchTestHooks.validateAndMapTurn(aliased, sources).answerBlocks.length, 2);
  } finally {
    console.error = originalError;
  }
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

test("accepts generated prose up to 20 percent beyond its target length", () => {
  const sources = liveResearchTestHooks.extractSources(providerResponse);
  const tolerated = structuredClone(validTurn);
  tolerated.answerBlocks[0].text = "x".repeat(901);

  const mapped = liveResearchTestHooks.validateAndMapTurn(tolerated, sources);
  assert.equal(mapped.answerBlocks[0].text.length, 901);

  const excessive = structuredClone(validTurn);
  excessive.answerBlocks[0].text = "x".repeat(1_081);
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.throws(
      () => liveResearchTestHooks.validateAndMapTurn(excessive, sources),
      (error) => error?.code === "SCHEMA_INVALID",
    );
  } finally {
    console.error = originalError;
  }
});

test("sends only the ordered topic trail as prior-content context", () => {
  const input = liveResearchTestHooks.buildResearchInput({
    question: "How does Bluetooth hopping avoid interference?",
    researchPreset: "standard",
    answerDensity: "balanced",
    imagePreference: "when-useful",
    topicTrail: ["radio spectrum", "frequency hopping"],
    rejectedQuestions: ["Who invented Bluetooth?"],
    seed: "PRIVATE STARTING QUESTION",
    priorAnswer: "PRIVATE OLD ANSWER",
    priorSources: ["PRIVATE OLD SOURCE"],
  });

  assert.match(input, /1\. radio spectrum\n2\. frequency hopping/);
  assert.match(input, /Question to research now: How does Bluetooth hopping avoid interference\?/);
  assert.doesNotMatch(input, /Who invented Bluetooth\?|PRIVATE STARTING QUESTION|PRIVATE OLD ANSWER|PRIVATE OLD SOURCE/);
});

test("repairs citation pointers with source IDs without rewriting prose", () => {
  const sources = liveResearchTestHooks.extractSources(providerResponse);
  const broken = structuredClone(validTurn);
  broken.answerBlocks[0].citationUrls = ["https://redirected.example/unknown"];
  const repaired = liveResearchTestHooks.applyCitationRepair(broken, sources, {
    blocks: [
      { sourceIds: ["S1"], unsupported: false },
      { sourceIds: ["S2"], unsupported: false },
    ],
  });

  assert.equal(repaired.turn.answerBlocks[0].text, broken.answerBlocks[0].text);
  assert.deepEqual(repaired.turn.options, broken.options);
  assert.deepEqual(repaired.turn.answerBlocks[0].citationUrls, ["https://example.org/evidence"]);
  assert.deepEqual(repaired.turn.answerBlocks[1].citationUrls, ["https://research.example.net/context"]);
  assert.deepEqual(repaired.unsupportedIndexes, []);
  assert.equal(liveResearchTestHooks.validateAndMapTurn(repaired.turn, sources).answerBlocks.length, 2);
});

test("keeps an unsupported citation block available for targeted recovery", () => {
  const sources = liveResearchTestHooks.extractSources(providerResponse);
  const broken = structuredClone(validTurn);
  broken.answerBlocks[0].citationUrls = ["https://unseen.example/claim"];
  const repaired = liveResearchTestHooks.applyCitationRepair(broken, sources, {
    blocks: [
      { sourceIds: [], unsupported: true },
      { sourceIds: ["S2"], unsupported: false },
    ],
  });
  assert.deepEqual(repaired.unsupportedIndexes, [0]);
  assert.equal(repaired.turn.answerBlocks[0].text, broken.answerBlocks[0].text);
});

test("prunes unsupported blocks only when at least two cited blocks survive", () => {
  const threeBlocks = structuredClone(validTurn);
  threeBlocks.answerBlocks.push({
    text: "A third supported block gives the resilient pipeline enough material to omit one failed section without discarding the complete turn.",
    citationUrls: ["https://example.org/evidence"],
  });
  assert.equal(liveResearchTestHooks.pruneUnsupportedBlocks(threeBlocks, [1]).answerBlocks.length, 2);
  assert.throws(
    () => liveResearchTestHooks.pruneUnsupportedBlocks(validTurn, [0]),
    (error) => error?.code === "CITATION_INVALID",
  );
});

test("runs exactly one no-search repair after an initial citation mismatch", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  env.OPENAI_API_KEY = "test-key";
  const broken = structuredClone(validTurn);
  broken.answerBlocks[0].citationUrls = ["https://redirected.example/unknown"];
  const completed = {
    id: "resp_research",
    output: providerResponse.output,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      total_tokens: 150,
      input_tokens_details: { cached_tokens: 10 },
      output_tokens_details: { reasoning_tokens: 5 },
    },
  };
  const stream = [
    { type: "response.output_text.delta", delta: JSON.stringify(broken) },
    { type: "response.completed", response: completed },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  const repairPayload = {
    id: "resp_repair",
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          blocks: [
            { sourceIds: ["S1"], unsupported: false },
            { sourceIds: ["S2"], unsupported: false },
          ],
        }),
      }],
    }],
    usage: {
      input_tokens: 20,
      output_tokens: 10,
      total_tokens: 30,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 2 },
    },
  };
  const requests = [];
  console.error = () => {};
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return requests.length === 1
      ? new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } })
      : Response.json(repairPayload);
  };
  const events = [];
  try {
    const draft = await runLiveResearch({
      requestId: "request-123",
      identityId: "identity-123",
      kind: "create",
      question: "How does Bluetooth avoid interference?",
      seed: "How does Bluetooth avoid interference?",
      depth: 0,
      performerId: "sage",
      modelId: "gpt-5.6-luna",
      researchPreset: "standard",
      answerDensity: "balanced",
      imagePreference: "when-useful",
      topicTrail: [],
      idempotencyKey: "idempotency-123",
      payloadHash: "payload-123",
    }, (event) => events.push(event));

    assert.equal(requests.length, 2);
    assert.deepEqual(requests[0].tools, [{
      type: "web_search",
      search_content_types: ["image", "text"],
      image_settings: { max_results: 10, caption: true },
    }]);
    assert.equal(requests[1].tools, undefined);
    assert.equal(draft.answerBlocks[0].sourceIds.length, 1);
    assert.equal(draft.usage.inputTokens, 120);
    assert.equal(draft.usage.outputTokens, 60);
    assert.equal(draft.usage.totalTokens, 180);
    assert.equal(draft.usage.reasoningTokens, 7);
    assert.ok(events.some((event) => event.label.includes("repairing pointers once")));
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
  }
});

test("recovers an unsupported block with a targeted web search", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  env.OPENAI_API_KEY = "test-key";
  const broken = structuredClone(validTurn);
  broken.answerBlocks[0].citationUrls = ["https://unseen.example/claim"];
  const completed = {
    id: "resp_research",
    output: providerResponse.output,
    usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 },
  };
  const stream = [
    { type: "response.output_text.delta", delta: JSON.stringify(broken) },
    { type: "response.completed", response: completed },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  const repairPayload = {
    id: "resp_repair",
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          blocks: [
            { sourceIds: [], unsupported: true },
            { sourceIds: ["S2"], unsupported: false },
          ],
        }),
      }],
    }],
    usage: { input_tokens: 20, output_tokens: 10, total_tokens: 30 },
  };
  const recoveredText =
    "Freshly recovered evidence supports this rewritten block while keeping the original answer’s explanatory role and readable progression intact.";
  const recoveryPayload = {
    id: "resp_recovery",
    output: [
      {
        type: "web_search_call",
        action: {
          sources: [{ title: "Recovered primary evidence", url: "https://recovery.example.edu/finding" }],
        },
      },
      {
        type: "message",
        content: [{
          type: "output_text",
          text: JSON.stringify({
            blocks: [{
              block: 1,
              text: recoveredText,
              citationUrls: ["https://recovery.example.edu/finding"],
            }],
          }),
        }],
      },
    ],
    usage: { input_tokens: 30, output_tokens: 15, total_tokens: 45 },
  };
  const requests = [];
  console.error = () => {};
  globalThis.fetch = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    if (requests.length === 1) {
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return Response.json(requests.length === 2 ? repairPayload : recoveryPayload);
  };
  try {
    const draft = await runLiveResearch({
      requestId: "request-recovery",
      identityId: "identity-recovery",
      kind: "create",
      question: "How does Bluetooth avoid interference?",
      seed: "How does Bluetooth avoid interference?",
      depth: 0,
      performerId: "sage",
      modelId: "gpt-5.6-luna",
      researchPreset: "standard",
      answerDensity: "balanced",
      imagePreference: "when-useful",
      topicTrail: [],
      idempotencyKey: "idempotency-recovery",
      payloadHash: "payload-recovery",
    }, () => {});

    assert.equal(requests.length, 3);
    assert.equal(requests[1].tools, undefined);
    assert.deepEqual(requests[2].tools, [{ type: "web_search" }]);
    assert.equal(draft.answerBlocks[0].text, recoveredText);
    assert.ok(draft.sources.some((source) => source.url === "https://recovery.example.edu/finding"));
    assert.equal(draft.usage.inputTokens, 150);
    assert.equal(draft.usage.outputTokens, 75);
    assert.equal(draft.usage.totalTokens, 225);
    assert.equal(draft.usage.webSearchCalls, 2);
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
  }
});

test("commits a shortened answer when recovery fails but two cited blocks survive", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  env.OPENAI_API_KEY = "test-key";
  const broken = structuredClone(validTurn);
  broken.answerBlocks.unshift({
    text: "This unsupported opening block is long enough for the answer contract but should be removed when targeted evidence recovery cannot validate it.",
    citationUrls: ["https://unseen.example/claim"],
  });
  const completed = { id: "resp_research", output: providerResponse.output, usage: {} };
  const stream = [
    { type: "response.output_text.delta", delta: JSON.stringify(broken) },
    { type: "response.completed", response: completed },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  const repairPayload = {
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          blocks: [
            { sourceIds: [], unsupported: true },
            { sourceIds: ["S1"], unsupported: false },
            { sourceIds: ["S2"], unsupported: false },
          ],
        }),
      }],
    }],
    usage: {},
  };
  const invalidRecoveryPayload = {
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify({
          blocks: [{
            block: 1,
            text: broken.answerBlocks[0].text,
            citationUrls: ["https://still-unseen.example/claim"],
          }],
        }),
      }],
    }],
    usage: {},
  };
  let requestCount = 0;
  console.error = () => {};
  globalThis.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) {
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    return Response.json(requestCount === 2 ? repairPayload : invalidRecoveryPayload);
  };
  try {
    const draft = await runLiveResearch({
      requestId: "request-prune",
      identityId: "identity-prune",
      kind: "create",
      question: "How does Bluetooth avoid interference?",
      seed: "How does Bluetooth avoid interference?",
      depth: 0,
      performerId: "sage",
      modelId: "gpt-5.6-luna",
      researchPreset: "standard",
      answerDensity: "balanced",
      imagePreference: "when-useful",
      topicTrail: [],
      idempotencyKey: "idempotency-prune",
      payloadHash: "payload-prune",
    }, () => {});

    assert.equal(requestCount, 3);
    assert.equal(draft.answerBlocks.length, 2);
    assert.ok(draft.answerBlocks.every((block) => block.text !== broken.answerBlocks[0].text));
  } finally {
    console.error = originalError;
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
  }
});
