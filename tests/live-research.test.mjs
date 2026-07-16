import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { PERFORMERS, REAL_WORLD_DISCOVERY_STARTERS, STARTERS } from "../lib/catalog.ts";
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
  assert.ok(mapped.media[0].commentary.split(/\s+/).length >= 30);
  assert.doesNotMatch(mapped.media[0].commentary, /answer block|block 1/i);
  assert.ok(mapped.sources.some((source) => source.relation === "image"));
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
    role: "process",
    commentary: "Look at how the slim vertical suspenders connect the roadway to the sweeping main cables above. Those main cables pass over the towers before descending toward distant anchorages, making the bridge's load path visible: roadway weight moves through the suspenders and cables, then into the towers and anchorages.",
    evidenceRelation: "illustrates",
  }];

  const repaired = liveResearchTestHooks.applyImageNoteRepair(mismatched, images, {
    notes: [{
      imageId: "I1",
      noteNumber: 1,
      title: mismatched.visualNotes[0].title,
      role: mismatched.visualNotes[0].role,
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
  const input = liveResearchTestHooks.buildResearchInput({
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

  const brief = liveResearchTestHooks.buildResearchInput({ ...base, answerDensity: "brief" });
  const balanced = liveResearchTestHooks.buildResearchInput({ ...base, answerDensity: "balanced" });
  const rich = liveResearchTestHooks.buildResearchInput({ ...base, answerDensity: "rich" });

  assert.match(brief, /exactly 2 compact answer blocks and about 2–4 sentences total/);
  assert.match(balanced, /2–3 answer blocks and about 5–7 sentences total/);
  assert.match(rich, /4–5 substantial answer blocks and about 8–12 sentences total/);
  assert.deepEqual(
    ["brief", "balanced", "rich"].map((density) => {
      const schema = liveResearchTestHooks.turnSchemaForDensity(density);
      return [schema.properties.answerBlocks.minItems, schema.properties.answerBlocks.maxItems];
    }),
    [[2, 2], [2, 3], [4, 5]],
  );
});

test("prompts research for source fitness, beginner clarity, and intentional visuals", () => {
  const instructions = liveResearchTestHooks.buildInstructions({
    name: "Mechanist",
    cue: "Makes hidden mechanisms legible.",
    values: ["mechanism"],
    voiceTraits: ["clear"],
    avoids: ["jargon"],
    toolPosture: "Search for first-party descriptions and measured evidence.",
    questionPosture: "Keep every question grounded in documented reality.",
  });

  assert.match(instructions, /Choose sources for what they are qualified to establish/);
  assert.match(instructions, /not to maximize the source count/);
  assert.match(instructions, /first answer block a direct, self-contained answer/);
  assert.match(instructions, /curious learner with no assumed specialist knowledge/);
  assert.match(instructions, /beautifully edited children's encyclopedia or science-museum exhibit/);
  assert.match(instructions, /most visually surprising, beautiful, strange, enormous, tiny, ancient, dynamic, or counterintuitive/);
  assert.match(instructions, /one strong hero image/);
  assert.match(instructions, /small intentional visual story/);
  assert.match(instructions, /Do not choose a chart, bar graph/);
  assert.match(instructions, /one natural, conversational paragraph/);
  assert.match(instructions, /Return no more than three visualNotes/);
  assert.match(instructions, /Creating the visual notes is part of selecting an image, not an optional follow-up/);
  assert.match(instructions, /Never leave a selected image without notes/);
  assert.match(instructions, /Do not use headings, labels, lists/);
  assert.match(instructions, /phrases such as 'answer block' or 'block 1'/);
  assert.match(instructions, /Every WonderDrive turn must select at least one sourced factual real-world image/);
  assert.match(instructions, /never return an empty visualNotes array/);
  assert.match(instructions, /doorway for a curious beginner of any age/);
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
  const instructions = liveResearchTestHooks.buildInstructions(atlas);
  assert.match(instructions, /do not turn that guidance into hypothetical or counterfactual paths/);
  assert.match(instructions, /make answer block 2 a sourced real-world relevance paragraph/);
  assert.match(instructions, /topicLabel as a concise subject label, not as a repetition/);
  assert.equal(STARTERS.atlas.length, 4);
  assert.equal(REAL_WORLD_DISCOVERY_STARTERS.length, 20);
  assert.ok([...STARTERS.atlas, ...REAL_WORLD_DISCOVERY_STARTERS.map((item) => item.question)]
    .every((question) => /\?$/.test(question)));
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
    liveResearchTestHooks.buildResearchInput({ ...base, imagePreference: "when-useful" }),
    /animals, space, archaeology, geology, machines, architecture, microscopic life/,
  );
  assert.match(
    liveResearchTestHooks.buildResearchInput({ ...base, imagePreference: "prefer" }),
    /Actively search for a compelling factual hero image/,
  );
  assert.match(
    liveResearchTestHooks.buildResearchInput({ ...base, imagePreference: "avoid" }),
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
  }
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
    assert.equal(requests[0].max_output_tokens, 8_000);
    assert.deepEqual(requests[0].reasoning, { effort: "medium" });
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
