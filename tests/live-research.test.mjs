import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { MODELS, PERFORMERS } from "../lib/catalog.ts";
import { liveResearchRequestBody, runLiveResearch } from "../lib/live-research.ts";
import {
  TURN_SCHEMA,
  buildInstructions,
  buildResearchInput,
  densityVerbosity,
  turnSchemaForDensity,
} from "../lib/research/prompt-policy.ts";
import * as providerResponsePolicy from "../lib/research/provider-response.ts";
import { readServerSentEvents, runProviderStream } from "../lib/research/provider-stream.ts";
import * as turnValidationPolicy from "../lib/research/turn-validation.ts";

const liveResearchTestHooks = {
  ...providerResponsePolicy,
  ...turnValidationPolicy,
};

function preparedResearch(overrides = {}) {
  return {
    requestId: "request-stream-characterization",
    identityId: "identity-stream-characterization",
    viewerMode: "guest",
    kind: "create",
    question: "How do split streaming frames preserve a structured response?",
    seed: "How do split streaming frames preserve a structured response?",
    depth: 0,
    performerId: "mechanist",
    modelId: "gpt-5.4-nano",
    researchPreset: "standard",
    answerDensity: "balanced",
    imagePreference: "avoid",
    outputLocale: "en",
    topicTrail: [],
    idempotencyKey: "idempotency-stream-characterization",
    payloadHash: "payload-stream-characterization",
    ...overrides,
  };
}

test("freezes one standard request configuration across every live model", () => {
  const liveModels = MODELS.filter((model) => model.mode === "live");
  const bodies = liveModels.map((model) => liveResearchRequestBody(preparedResearch({
    modelId: model.id,
    imagePreference: "prefer",
  })));
  const canonical = { ...bodies[0], model: "<model>" };
  for (const body of bodies) {
    assert.deepEqual({ ...body, model: "<model>" }, canonical);
    assert.deepEqual(body.reasoning, { effort: "high" });
    assert.equal(body.max_output_tokens, 30_000);
    assert.equal(body.max_tool_calls, 12);
  }
});

test("lease ownership is checked before the first provider attempt", async () => {
  let providerCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    providerCalls += 1;
    return Response.json({});
  };
  try {
    await assert.rejects(
      () => runLiveResearch(
        preparedResearch(),
        () => {},
        undefined,
        async () => { throw new Error("lease lost"); },
      ),
      /lease lost/,
    );
    assert.equal(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function usageWriteCounter() {
  let writes = 0;
  env.DB = {
    prepare(sql) {
      return {
        bind() { return this; },
        async run() {
          if (sql.includes("INSERT INTO provider_usage_events")) writes += 1;
          return { success: true };
        },
      };
    },
  };
  return () => writes;
}

function streamUsageContext() {
  return {
    identityId: "identity-stream-characterization",
    viewerMode: "guest",
    researchRequestId: "request-stream-characterization",
    modelId: "gpt-5.4-nano",
    operation: "live_research",
    purpose: "opening_turn",
    metadata: {
      preset: "standard",
      answerDensity: "balanced",
      imagePreference: "avoid",
      depth: 0,
    },
    callKey: `stream-test:${crypto.randomUUID()}`,
  };
}

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
      text: "The first part of this researched performance is deliberately long enough to satisfy CuriosityPedia’s answer contract and make one supported claim.",
      citationUrls: ["https://example.org/evidence"],
    },
    {
      text: "The second part cross-checks that claim against another returned source, preserving the difference between evidence and the performer’s framing.",
      citationUrls: ["https://research.example.net/context"],
    },
  ],
  visualNotes: [],
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

const knowledgeCheckFixture = {
  declarationQuestion: "Do you understand how the bridge cables carry the roadway load?",
  question: "Why do suspension bridge cables curve?",
  options: [
    "The roadway transfers weight through suspenders into the main cables, towers, anchorages, and ground.",
    "The roadway floats independently while the cables serve only as wind markers above it.",
    "The towers pull the roadway upward magnetically, so the main cables carry almost no force.",
    "The anchorages push the entire bridge sideways, while the suspenders prevent any vertical movement.",
    "The main cables support only the towers, and the roadway carries its own weight without them.",
    "The vertical suspenders hold decorative lighting but do not connect the roadway to the main cables.",
    "The bridge load travels only along the roadway until it reaches the far shoreline at either end.",
    "The towers and cables block river currents, and water pressure below supports the roadway deck.",
  ],
  correctOptionIndex: 0,
  explanation: "The visible suspenders, main cables, towers, and anchorages form a continuous path that carries the roadway load into the ground.",
};

test("normalizes and deduplicates provider-returned web sources", () => {
  const sources = liveResearchTestHooks.extractSources(providerResponse);
  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, "https://example.org/evidence");
  assert.equal(sources[1].publisher, "research.example.net");
});

test("ignores malformed provider envelopes and counts only recognized research actions", () => {
  assert.deepEqual(liveResearchTestHooks.extractSources({ output: "not-an-array" }), []);
  assert.deepEqual(liveResearchTestHooks.extractImages({ output: [{ type: "web_search_call", results: [{}] }] }), []);
  const response = {
    output: [
      null,
      { type: "web_search_call", action: { type: "search", sources: [{ url: "not a URL" }] } },
      { type: "web_search_call", action: { type: "open_page" } },
      { type: "tool_call", action: { type: "find_in_page" } },
      { type: "tool_call", action: { type: "click" } },
    ],
  };

  assert.deepEqual(liveResearchTestHooks.extractSources(response), []);
  assert.equal(liveResearchTestHooks.countWebSearchCalls(response), 2);
  assert.equal(liveResearchTestHooks.countPageFetches(response), 2);
});

test("rejects malformed JSON and array-shaped generated turns at the parsing boundary", () => {
  const failure = (detail) => Object.assign(new Error(detail), { code: "SCHEMA_INVALID" });
  assert.equal(
    liveResearchTestHooks.parseModelTurn(JSON.stringify(validTurn), failure).topicLabel,
    validTurn.topicLabel,
  );
  assert.throws(
    () => liveResearchTestHooks.parseModelTurn("[]", failure),
    (error) => error?.code === "SCHEMA_INVALID" && /turn object/i.test(error.message),
  );
  assert.throws(
    () => liveResearchTestHooks.parseModelTurn("not-json", failure),
    (error) => error?.code === "SCHEMA_INVALID" && /could not be validated/i.test(error.message),
  );
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
        {
          type: "image_result",
          image_url: "https://images.example.org/bridge-crop.jpg",
          source_website_url: "https://example.org/bridge",
          caption: "A cropped suspension bridge photograph showing the main cables.",
        },
      ],
    }],
  };
  const images = liveResearchTestHooks.extractImages(response);
  const annotatedTurn = structuredClone(validTurn);
  annotatedTurn.visualNotes = [
    {
      sourcePageUrl: "https://example.org/bridge",
      title: "Main cables of a suspension bridge",
      role: "process",
      commentary: "Look at how the slim vertical suspenders connect the roadway to the sweeping main cables above. Those main cables pass over the towers before descending toward distant anchorages, making the bridge's load path visible: roadway weight moves through the suspenders and cables, then into the towers and anchorages.",
      evidenceRelation: "illustrates",
      knowledgeCheck: knowledgeCheckFixture,
    },
    {
      sourcePageUrl: "https://example.org/joints",
      title: "Expansion joint",
      role: "object",
      commentary: "Look at the gap.",
      evidenceRelation: "shows",
    },
  ];
  const mapped = liveResearchTestHooks.validateAndMapTurn(
    annotatedTurn,
    liveResearchTestHooks.extractSources(providerResponse),
    "prefer",
    images,
  );

  assert.equal(mapped.media.length, 1);
  assert.equal(mapped.media[0].thumbnailUrl, "https://images.example.org/bridge-thumb.jpg");
  assert.equal(mapped.media[0].title, "Main cables of a suspension bridge");
  assert.deepEqual(mapped.media[0].knowledgeCheck, knowledgeCheckFixture);
  assert.ok(mapped.media[0].commentary.split(/\s+/).length >= 30);
  assert.doesNotMatch(mapped.media[0].commentary, /answer block|block 1/i);
  assert.ok(mapped.sources.some((source) => source.relation === "image"));
});

test("preserves consulted source relations and legacy visual-note commentary", () => {
  const images = liveResearchTestHooks.extractImages({
    output: [{
      type: "web_search_call",
      action: {
        results: [{
          type: "image_result",
          image_url: "https://images.example.org/legacy.jpg",
          source_website_url: "https://museum.example.org/exhibits/legacy-machine",
          caption: "A museum machine with its drive mechanism exposed.",
        }],
      },
    }],
  });
  const turn = structuredClone(validTurn);
  turn.answerBlocks[1].citationUrls = ["https://example.org/evidence"];
  turn.visualNotes = [{
    sourcePageUrl: "https://museum.example.org/exhibits/legacy-machine",
    title: "Exposed drive mechanism",
    role: "mechanism",
    commentary: "",
    whyIncluded: "The museum view exposes the machine's connected drive parts instead of hiding them behind an outer case.",
    whatToNotice: ["A narrow belt links the upper wheel to the lower shaft.", "Both wheels share the same visible direction of travel."],
    learning: "The linked parts turn one local motion into coordinated movement across the whole mechanism.",
    evidenceRelation: "illustrates",
  }];

  const mapped = liveResearchTestHooks.validateAndMapTurn(
    turn,
    liveResearchTestHooks.extractSources(providerResponse),
    "prefer",
    images,
  );

  assert.equal(mapped.media.length, 1);
  assert.match(mapped.media[0].commentary, /museum view exposes/);
  assert.deepEqual(mapped.sources.map((source) => source.relation), ["cited", "consulted", "image"]);
});

test("rejects unsafe provider image provenance without weakening optional text turns", () => {
  const images = liveResearchTestHooks.extractImages({
    output: [{
      type: "web_search_call",
      results: [{
        type: "image_result",
        image_url: "https://127.0.0.1/private.jpg",
        source_website_url: "https://example.org/private-image",
        caption: "A private-network image result.",
      }],
    }],
  });
  const turn = structuredClone(validTurn);
  turn.visualNotes = [{
    sourcePageUrl: "https://example.org/private-image",
    title: "Private image",
    role: "context",
    commentary: "This deliberately long visual note describes enough concrete visible detail to pass commentary specificity, while the private-network image URL itself must still prevent the media item from entering the mapped turn or its source provenance collection.",
    evidenceRelation: "shows",
  }];

  const mapped = liveResearchTestHooks.validateAndMapTurn(
    turn,
    liveResearchTestHooks.extractSources(providerResponse),
    "when-useful",
    images,
  );
  assert.deepEqual(mapped.media, []);
  assert.ok(mapped.sources.every((source) => source.relation !== "image"));
});

test("requires validated visual notes when factual images are mandatory", () => {
  const images = liveResearchTestHooks.extractImages({
    output: [{
      type: "web_search_call",
      results: [{
        type: "image_result",
        image_url: "https://images.example.org/bridge.jpg",
        thumbnail_url: "https://images.example.org/bridge-thumb.jpg",
        source_website_url: "https://example.org/bridge",
        caption: "Golden Gate Bridge at sunset from the shoreline.",
      }],
    }],
  });

  assert.throws(
    () => liveResearchTestHooks.validateAndMapTurn(
      validTurn,
      liveResearchTestHooks.extractSources(providerResponse),
      "prefer",
      images,
    ),
    (error) => error?.code === "RESEARCH_VALIDATION_FAILED" && error?.retryable === true,
  );
  const optional = liveResearchTestHooks.validateAndMapTurn(
    validTurn,
    liveResearchTestHooks.extractSources(providerResponse),
    "when-useful",
    images,
  );

  assert.equal(optional.media.length, 0);
});

test("treats an explicit photograph request as an image preference", () => {
  assert.equal(
    liveResearchTestHooks.imagePreferenceForQuestion("when-useful", "Find recent factual photographs of the Golden Gate Bridge."),
    "prefer",
  );
  assert.equal(
    liveResearchTestHooks.imagePreferenceForQuestion("when-useful", "How do suspension bridges carry weight?"),
    "when-useful",
  );
  assert.equal(
    liveResearchTestHooks.imagePreferenceForQuestion("avoid", "Show me photos of the bridge."),
    "avoid",
  );
});

test("requires sourced real-world media when the visual contract is preferred", () => {
  assert.throws(
    () => liveResearchTestHooks.validateAndMapTurn(
      validTurn,
      liveResearchTestHooks.extractSources(providerResponse),
      "prefer",
      [],
    ),
    (error) => error?.code === "RESEARCH_VALIDATION_FAILED" && error?.retryable === true,
  );
});

test("repairs mismatched model image URLs with server-owned provider image IDs", () => {
  const images = liveResearchTestHooks.extractImages({
    output: [{
      type: "web_search_call",
      results: [{
        type: "image_result",
        image_url: "https://images.example.org/bridge.jpg",
        thumbnail_url: "https://images.example.org/bridge-thumb.jpg",
        source_website_url: "https://example.org/provider-bridge-page",
        caption: "A suspension bridge showing its main cables.",
      }],
    }],
  });
  const mismatched = structuredClone(validTurn);
  mismatched.visualNotes = [{
    sourcePageUrl: "https://different.example.net/model-selected-page",
    title: "Main cables of a suspension bridge",
    role: "mechanism",
    commentary: "Look at how the slim vertical suspenders connect the roadway to the sweeping main cables above. Those main cables pass over the towers before descending toward distant anchorages, making the bridge's load path visible: roadway weight moves through the suspenders and cables, then into the towers and anchorages.",
    evidenceRelation: "illustrates",
  }];

  const repaired = liveResearchTestHooks.applyImageNoteRepair(mismatched, images, {
    notes: [{
      imageId: "I1",
      noteNumber: 1,
      title: mismatched.visualNotes[0].title,
      role: "mechanism",
      commentary: mismatched.visualNotes[0].commentary,
      evidenceRelation: mismatched.visualNotes[0].evidenceRelation,
    }],
  });
  const mapped = liveResearchTestHooks.validateAndMapTurn(
    repaired,
    liveResearchTestHooks.extractSources(providerResponse),
    "prefer",
    images,
  );

  assert.equal(repaired.visualNotes[0].sourcePageUrl, "https://example.org/provider-bridge-page");
  assert.equal(mapped.media.length, 1);
  assert.equal(mapped.media[0].imageUrl, "https://images.example.org/bridge.jpg");
});

test("repairs a provider image URL when the host and page slug strongly overlap", () => {
  const images = [{
    imageUrl: "https://cdn.example.org/tour.jpg",
    sourcePageUrl: "https://www.dylanstours.com/tours/open-air-city-tour-alcatraz/",
    caption: "Golden Gate Bridge at sunset during an open-air city tour.",
  }];
  const turn = structuredClone(validTurn);
  turn.visualNotes = [{
    sourcePageUrl: "https://dylanstours.com/open-air-city-tour-alcatraz/",
    title: "Golden Gate Bridge glowing above the bay",
    role: "context",
    commentary: "Notice how the orange bridge stays distinct against the softer sunset colors while reflected light breaks into smaller patches across the moving water. Its saturated paint remains visually prominent because it contrasts with the changing atmospheric light, distant bay, and evening sky.",
    evidenceRelation: "illustrates",
  }];

  const repaired = liveResearchTestHooks.repairImageNotesBySourcePath(turn, images, "en");
  const mapped = liveResearchTestHooks.validateAndMapTurn(
    repaired,
    liveResearchTestHooks.extractSources(providerResponse),
    "prefer",
    images,
  );

  assert.equal(repaired.visualNotes[0].sourcePageUrl, images[0].sourcePageUrl);
  assert.equal(mapped.media.length, 1);
});

test("rejects duplicate image-note repair assignments", () => {
  const images = [
    { imageUrl: "https://images.example.org/one.jpg", sourcePageUrl: "https://example.org/one", caption: "Bridge cables" },
    { imageUrl: "https://images.example.org/two.jpg", sourcePageUrl: "https://example.org/two", caption: "Bridge tower" },
  ];
  const turn = structuredClone(validTurn);
  turn.visualNotes = [
    { sourcePageUrl: "https://wrong.example/a", title: "Bridge cables", role: "object", whyIncluded: "one", whatToNotice: ["one", "two"], learning: "one", evidenceRelation: "shows" },
    { sourcePageUrl: "https://wrong.example/b", title: "Bridge tower", role: "object", whyIncluded: "two", whatToNotice: ["one", "two"], learning: "two", evidenceRelation: "shows" },
  ];

  assert.throws(
    () => liveResearchTestHooks.applyImageNoteRepair(turn, images, {
      notes: [
        {
          imageId: "I1", noteNumber: 1, title: "Bridge cables", role: "object",
          whyIncluded: "This bridge image clearly shows the cable system carrying roadway loads toward the towers and distant anchorages in a visible example.",
          whatToNotice: ["Vertical suspenders connect the roadway directly to curving main cables.", "Main cables pass over towers before descending toward the anchorages."],
          learning: "Suspension bridges transfer roadway weight through vertical suspenders and main cables before towers and anchorages carry those forces into the ground.",
          evidenceRelation: "shows",
        },
        {
          imageId: "I1", noteNumber: 2, title: "Bridge tower", role: "object",
          whyIncluded: "This bridge image clearly shows the tower supporting cables above the roadway and organizing the structure into a visible load path.",
          whatToNotice: ["The tower rises above the roadway and supports both main cables.", "Suspender cables descend toward the deck on both tower sides."],
          learning: "A suspension bridge tower redirects cable forces downward while keeping the main span elevated above the water or landscape below.",
          evidenceRelation: "shows",
        },
      ],
    }),
    (error) => error?.code === "SCHEMA_INVALID",
  );
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
  const input = buildResearchInput({
    question: "How does Bluetooth hopping avoid interference?",
    researchPreset: "standard",
    answerDensity: "balanced",
    imagePreference: "when-useful",
    outputLocale: "es",
    topicTrail: ["radio spectrum", "frequency hopping"],
    rejectedQuestions: ["Who invented Bluetooth?"],
    seed: "PRIVATE STARTING QUESTION",
    priorAnswer: "PRIVATE OLD ANSWER",
    priorSources: ["PRIVATE OLD SOURCE"],
  });

  assert.match(input, /1\. radio spectrum\n2\. frequency hopping/);
  assert.match(input, /Question to research now: How does Bluetooth hopping avoid interference\?/);
  assert.match(input, /Reader output language: Español \(es\)\./);
  assert.match(input, /not evidence of the learner's knowledge or proficiency/);
  assert.doesNotMatch(input, /Who invented Bluetooth\?|PRIVATE STARTING QUESTION|PRIVATE OLD ANSWER|PRIVATE OLD SOURCE/);
});

test("makes each answer-density preference explicit and schema-enforced", () => {
  const base = {
    question: "Why do whales sing?",
    researchPreset: "standard",
    imagePreference: "when-useful",
    outputLocale: "en",
    topicTrail: [],
  };

  const brief = buildResearchInput({ ...base, answerDensity: "brief" });
  const balanced = buildResearchInput({ ...base, answerDensity: "balanced" });
  const rich = buildResearchInput({ ...base, answerDensity: "rich" });

  assert.match(brief, /exactly 2 compact answer blocks and about 2–4 sentences total/);
  assert.match(balanced, /2–3 answer blocks and about 5–7 sentences total/);
  assert.match(rich, /4–5 substantial answer blocks and about 8–12 sentences total/);
  assert.deepEqual(
    ["brief", "balanced", "rich"].map((density) => {
      const schema = turnSchemaForDensity(density);
      return [schema.properties.answerBlocks.minItems, schema.properties.answerBlocks.maxItems];
    }),
    [[2, 2], [2, 3], [4, 5]],
  );
  assert.deepEqual(
    ["brief", "balanced", "rich"].map(densityVerbosity),
    ["low", "medium", "high"],
  );
});

test("publishes the exact structured-turn schema policy", () => {
  assert.deepEqual(TURN_SCHEMA.required, [
    "topicLabel",
    "answerBlocks",
    "visualNotes",
    "transition",
    "researchSummary",
    "researchHandoff",
    "preferredPosition",
    "options",
  ]);
  assert.deepEqual(TURN_SCHEMA.properties.answerBlocks, {
    type: "array",
    minItems: 2,
    maxItems: 5,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["text", "citationUrls"],
      properties: {
        text: { type: "string", minLength: 20, maxLength: 1_080 },
        citationUrls: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: { type: "string", minLength: 6, maxLength: 2_458 },
        },
      },
    },
  });
  assert.deepEqual(TURN_SCHEMA.properties.visualNotes.items.properties.role.enum, [
    "phenomenon",
    "mechanism",
    "scale",
    "anchor",
    "comparison",
    "object",
    "process",
    "result",
    "context",
    "primary-source",
  ]);
  assert.ok(TURN_SCHEMA.properties.visualNotes.items.required.includes("knowledgeCheck"));
  assert.ok(!TURN_SCHEMA.properties.visualNotes.items.required.includes("curiosityQuestion"));
  assert.ok(!TURN_SCHEMA.properties.visualNotes.items.properties.knowledgeCheck.required.includes("declarationQuestion"));
  assert.equal(TURN_SCHEMA.properties.visualNotes.items.properties.knowledgeCheck.properties.question.maxLength, 140);
  assert.equal(TURN_SCHEMA.properties.visualNotes.items.properties.knowledgeCheck.properties.options.minItems, 8);
  assert.equal(TURN_SCHEMA.properties.visualNotes.items.properties.knowledgeCheck.properties.options.maxItems, 8);
  assert.equal(TURN_SCHEMA.properties.visualNotes.maxItems, 12);
  assert.deepEqual(TURN_SCHEMA.properties.researchHandoff.required, [
    "discoveries",
    "uncertainties",
    "unresolvedThreads",
    "sourceLeads",
  ]);
  assert.deepEqual(TURN_SCHEMA.properties.options, {
    type: "array",
    minItems: 2,
    maxItems: 2,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["question", "angle"],
      properties: {
        question: { type: "string", minLength: 3, maxLength: 132 },
        angle: { type: "string", minLength: 1, maxLength: 39 },
      },
    },
  });
});

test("implements the v4 phenomenon-first three-pass editorial system", () => {
  const instructions = buildInstructions({
    name: "Mechanist",
    cue: "Makes hidden mechanisms legible.",
    values: ["mechanism"],
    voiceTraits: ["clear"],
    avoids: ["jargon"],
    toolPosture: "Search for first-party descriptions and measured evidence.",
    questionPosture: "Keep every question grounded in documented reality.",
  });

  assert.match(instructions, /Choose sources for what they are qualified to establish/);
  assert.match(instructions, /not to maximize fact or source count/);
  assert.match(instructions, /curious learner with no assumed specialist knowledge/);
  assert.match(instructions, /research editor inside a curiosity product/);
  assert.match(instructions, /not writing an encyclopedia entry/);
  assert.match(instructions, /short illustrated explanation/);
  assert.match(instructions, /PASS 1 — EDITORIAL DESK/);
  assert.match(instructions, /at least eight questionCandidates/);
  assert.match(instructions, /PASS 2 — READER-FACING EDIT/);
  assert.match(instructions, /PASS 3 — EDITORIAL CHECK/);
  assert.match(instructions, /phenomenon-first order/);
  assert.match(instructions, /first 45 words/);
  assert.match(instructions, /one big idea specific enough/);
  assert.match(instructions, /Search for the needed visual claim, not the article topic/);
  assert.match(instructions, /commentary would still make sense beneath ten other images/);
  assert.match(instructions, /LOCATE exactly what is shown/);
  assert.match(instructions, /no more than twelve/);
  assert.match(instructions, /encyclopedia-grade sequence of 8–12 factual images/);
  assert.match(instructions, /return no image rather than a weak one/);
  assert.match(instructions, /Silently generate at least eight candidates/);
  assert.match(instructions, /could be answered with a definition/);
  assert.match(instructions, /EDITORIAL FAILURE CHECKS/);
  assert.match(instructions, /Can the reader not state one changed mental model/);
  assert.match(instructions, /Research posture: Search for first-party descriptions and measured evidence/);
  assert.match(instructions, /Question posture: Keep every question grounded in documented reality/);
  assert.match(instructions, /Research and select sources in whichever languages provide the strongest evidence/);
  assert.match(instructions, /Write every reader-facing natural-language field in that output language/);
});

test("Atlas keeps generated paths on documented real-world subjects", () => {
  const atlas = PERFORMERS.find((performer) => performer.id === "atlas");
  assert.ok(atlas);
  assert.match(atlas.questionPosture, /Every generated question must concern something real and researchable/);
  assert.match(atlas.questionPosture, /Never invent fictional premises, imaginary worlds/);
  assert.match(atlas.toolPosture, /Search first/);
  const instructions = buildInstructions(atlas);
  assert.match(instructions, /do not turn that guidance into hypothetical or counterfactual paths/);
  assert.match(instructions, /documented real-world anchor is mandatory/);
  assert.match(instructions, /topicLabel as a concise subject label, not as a repetition/);
});

test("turn input makes image preference operational", () => {
  const base = {
    question: "Why did some dinosaurs grow feathers?",
    researchPreset: "standard",
    answerDensity: "balanced",
    outputLocale: "en",
    topicTrail: [],
  };
  assert.match(
    buildResearchInput({ ...base, imagePreference: "when-useful" }),
    /return an empty visual set rather than weak, decorative, or merely topical images/,
  );
  assert.match(
    buildResearchInput({ ...base, imagePreference: "prefer" }),
    /encyclopedia-grade visual sequence of 8–12 high-resolution factual images/,
  );
  assert.match(
    buildResearchInput({ ...base, imagePreference: "avoid" }),
    /Do not search for or return images/,
  );
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

test("reports a provider token-limit terminal event instead of a missing response", async () => {
  const originalFetch = globalThis.fetch;
  env.OPENAI_API_KEY = "test-key";
  usageWriteCounter();
  const incomplete = {
    id: "resp_incomplete",
    status: "incomplete",
    incomplete_details: { reason: "max_output_tokens" },
    output: [],
    usage: {
      input_tokens: 100,
      output_tokens: 8_000,
      total_tokens: 8_100,
      output_tokens_details: { reasoning_tokens: 8_000 },
    },
  };
  // The parser must retain a final provider event even if the transport closes
  // without the optional trailing blank line.
  const stream = `data: ${JSON.stringify({ type: "response.incomplete", response: incomplete })}`;
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream", "x-request-id": "req_incomplete" },
  });
  try {
    await assert.rejects(
      () => runLiveResearch({
        requestId: "request-incomplete",
        identityId: "identity-incomplete",
        kind: "create",
        question: "Why can reasoning consume an output allowance?",
        seed: "Why can reasoning consume an output allowance?",
        depth: 0,
        performerId: "mechanist",
        modelId: "gpt-5.4-nano",
        researchPreset: "standard",
        answerDensity: "balanced",
        imagePreference: "avoid",
        topicTrail: [],
        idempotencyKey: "idempotency-incomplete",
        payloadHash: "payload-incomplete",
      }, () => {}),
      (error) => error?.code === "PROVIDER_ERROR" && /full reasoning and output allowance/i.test(error.message),
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});

test("parses split SSE frames, ignores malformed frames, and retains an unterminated final frame", async () => {
  const encoder = new TextEncoder();
  const chunks = [
    "data: {\"type\":\"response.output_",
    "text.delta\",\"delta\":\"part\"}\n\ndata: not-json\n\n",
    "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_final\"}}",
  ];
  const stream = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  const observations = [];
  const events = [];
  for await (const event of readServerSentEvents(
    stream,
    (kind, type = "") => observations.push([kind, type]),
  )) {
    events.push(event);
  }

  assert.deepEqual(events.map((event) => event.type), [
    "response.output_text.delta",
    "response.completed",
  ]);
  assert.deepEqual(observations, [
    ["event", "response.output_text.delta"],
    ["malformed", ""],
    ["event", "response.completed"],
  ]);
});

test("records exactly one usage outcome for HTTP, missing-body, and missing-terminal stream failures", async () => {
  const originalFetch = globalThis.fetch;
  env.OPENAI_API_KEY = "test-key";
  const cases = [
    {
      response: () => new Response("rejected", { status: 429 }),
      code: "PROVIDER_ERROR",
      retryable: true,
    },
    {
      response: () => new Response("rejected", { status: 403 }),
      code: "PROVIDER_UNAVAILABLE",
      retryable: false,
    },
    {
      response: () => new Response(null, { status: 200 }),
      code: "PROVIDER_ERROR",
      retryable: true,
    },
    {
      response: () => new Response("data: [DONE]\n\n", { status: 200 }),
      code: "PROVIDER_ERROR",
      retryable: true,
    },
  ];
  try {
    for (const [index, item] of cases.entries()) {
      const writes = usageWriteCounter();
      globalThis.fetch = async () => item.response();
      await assert.rejects(
        () => runLiveResearch(preparedResearch({ requestId: `request-terminal-${index}` }), () => {}),
        (error) => error?.code === item.code && error?.retryable === item.retryable,
      );
      assert.equal(writes(), 1);
    }
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});

test("maps a pre-dispatch external abort to the provider-timeout error without recording provider usage", async () => {
  const originalFetch = globalThis.fetch;
  env.OPENAI_API_KEY = "test-key";
  const writes = usageWriteCounter();
  const external = new AbortController();
  globalThis.fetch = async (_url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });

  try {
    const research = runLiveResearch(preparedResearch(), () => {}, external.signal);
    external.abort("characterized client disconnect");
    await assert.rejects(
      () => research,
      (error) => error?.code === "PROVIDER_TIMEOUT" && error?.status === 504,
    );
    assert.equal(writes(), 0);
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});

test("maps the provider-stream deadline to the same timeout error and records it once", async () => {
  const originalFetch = globalThis.fetch;
  env.OPENAI_API_KEY = "test-key";
  const writes = usageWriteCounter();
  globalThis.fetch = async (_url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
  });

  try {
    await assert.rejects(
      () => runProviderStream({
        requestBody: { stream: true, store: false },
        timeoutMs: 0,
        startedAt: Date.now(),
        usageContext: streamUsageContext(),
      }),
      (error) => error?.code === "PROVIDER_TIMEOUT" && error?.status === 504,
    );
    assert.equal(writes(), 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});

test("returns the completed provider envelope and records one successful stream outcome", async () => {
  const originalFetch = globalThis.fetch;
  env.OPENAI_API_KEY = "test-key";
  const writes = usageWriteCounter();
  const completed = {
    id: "resp_stream_success",
    output: [],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  };
  const stream = [
    { type: "response.output_text.delta", delta: "structured output" },
    { type: "response.completed", response: completed },
  ].map((event) => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n";
  globalThis.fetch = async () => new Response(stream, {
    status: 200,
    headers: { "x-request-id": "req_stream_success" },
  });

  try {
    const result = await runProviderStream({
      requestBody: { stream: true, store: false },
      timeoutMs: 1_000,
      startedAt: Date.now(),
      usageContext: streamUsageContext(),
    });
    assert.equal(result.outputText, "structured output");
    assert.equal(result.completedResponse.id, "resp_stream_success");
    assert.equal(writes(), 1);
  } finally {
    globalThis.fetch = originalFetch;
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});

test("runs exactly one no-search repair after an initial citation mismatch", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  env.OPENAI_API_KEY = "test-key";
  usageWriteCounter();
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
    assert.equal(requests[0].model, "gpt-5.6-luna");
    assert.equal(requests[0].instructions, buildInstructions(
      PERFORMERS.find((performer) => performer.id === "sage"),
    ));
    assert.equal(requests[0].input, buildResearchInput({
      question: "How does Bluetooth avoid interference?",
      researchPreset: "standard",
      answerDensity: "balanced",
      imagePreference: "when-useful",
      topicTrail: [],
    }));
    assert.deepEqual(requests[0].include, [
      "web_search_call.action.sources",
      "web_search_call.results",
    ]);
    assert.equal(requests[0].tool_choice, "auto");
    assert.equal(requests[0].max_output_tokens, 30_000);
    assert.deepEqual(requests[0].reasoning, { effort: "high" });
    assert.deepEqual(requests[0].text, {
      format: {
        type: "json_schema",
        name: "curiositypedia_turn",
        strict: true,
        schema: turnSchemaForDensity("balanced"),
      },
      verbosity: "medium",
    });
    assert.equal(requests[0].safety_identifier, "wd_identity-123");
    assert.equal(requests[0].store, false);
    assert.equal(requests[0].stream, true);
    assert.equal(requests[1].tools, undefined);
    assert.equal(requests[1].max_output_tokens, 5_000);
    assert.deepEqual(requests[1].reasoning, { effort: "high" });
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
    delete env.DB;
  }
});

test("recovers an unsupported block with a targeted web search", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  env.OPENAI_API_KEY = "test-key";
  usageWriteCounter();
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
    assert.equal(requests[1].max_output_tokens, 5_000);
    assert.deepEqual(requests[1].reasoning, { effort: "high" });
    assert.deepEqual(requests[2].tools, [{ type: "web_search" }]);
    assert.equal(requests[2].max_output_tokens, 10_000);
    assert.deepEqual(requests[2].reasoning, { effort: "high" });
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
    delete env.DB;
  }
});

test("commits a shortened answer when recovery fails but two cited blocks survive", async () => {
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  env.OPENAI_API_KEY = "test-key";
  usageWriteCounter();
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
    delete env.DB;
  }
});
