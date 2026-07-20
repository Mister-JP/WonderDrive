import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
  compareJourneys,
  getJourney,
  listJourneys,
  listRejectedQuestions,
} from "../lib/repository.ts";

const viewer = {
  identityId: "identity-owner",
  mode: "chatgpt",
  displayName: "Owner",
  journeyLimit: 20,
};

function journeyRow(changes = {}) {
  return {
    id: "journey-alpha",
    seed: "Why do fireflies glow?",
    title: "Firefly trail",
    performer_id: "sage",
    model_id: "gpt-5.6-terra",
    research_preset: "standard",
    answer_density: "balanced",
    image_preference: "when-useful",
    output_locale: "en",
    pinned: 1,
    hidden: 0,
    current_turn_id: "turn-current",
    turn_count: 2,
    source_count: 3,
    status: "active",
    version: 7,
    created_at: 700,
    updated_at: 900,
    open_branch_count: 2,
    ...changes,
  };
}

function turnRow(changes = {}) {
  return {
    id: "turn-current",
    parent_turn_id: null,
    depth: 0,
    question: "Why do fireflies glow?",
    answer: "Legacy plain answer",
    answer_json: null,
    transition: "Opening",
    topic_label: "Bioluminescence",
    research_summary: "A compact summary",
    research_handoff_json: null,
    preferred_position: 1,
    option_set_version: 3,
    run_provider: null,
    turn_provider: null,
    turn_model_id: null,
    prompt_version: null,
    performer_version: null,
    model_snapshot: null,
    turn_answer_density: null,
    turn_image_preference: null,
    turn_output_locale: null,
    provider_response_id: null,
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    reasoning_tokens: 0,
    total_tokens: 0,
    web_search_calls: 0,
    page_fetches: 0,
    latency_ms: 0,
    estimated_cost_microusd: 0,
    rate_effective_at: "2026-07-13",
    created_at: 100,
    ...changes,
  };
}

function createScriptedD1(respond) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async first() {
          return respond(call, "first");
        },
        async all() {
          return { results: await respond(call, "all") };
        },
      };
    },
  };
}

function normalizedSql(call) {
  return call.sql.replace(/\s+/g, " ").trim();
}

function emptyHydrationResponse(call, method) {
  const sql = normalizedSql(call);
  if (method === "first" && sql.includes("FROM journeys")) return journeyRow();
  if (method === "all") return [];
  throw new Error(`Unexpected ${method} query: ${sql}`);
}

test("listJourneys preserves ownership, creation time, soft-delete filtering, ordering, and topic projection", async () => {
  const db = createScriptedD1((call, method) => {
    const sql = normalizedSql(call);
    if (method === "all" && sql.includes("FROM journeys")) {
      return [
        journeyRow(),
        journeyRow({
          id: "journey-beta",
          title: "Ocean trail",
          current_turn_id: "turn-beta",
          pinned: 0,
          hidden: 1,
          updated_at: 800,
        }),
      ];
    }
    if (method === "all" && sql.includes("SELECT journey_id, parent_turn_id, topic_label, answer_json FROM turns")) {
      return [
        { journey_id: "journey-alpha", parent_turn_id: null, topic_label: "Bioluminescence", answer_json: JSON.stringify({ blocks: [], media: [{ imageUrl: "https://images.example/firefly.jpg", sourcePageUrl: "https://example.org/fireflies", caption: "A firefly", alt: "A glowing firefly" }] }) },
        { journey_id: "journey-alpha", parent_turn_id: "turn-root", topic_label: "Bioluminescence", answer_json: null },
        { journey_id: "journey-alpha", parent_turn_id: "turn-root", topic_label: "Evolution", answer_json: null },
        { journey_id: "journey-beta", parent_turn_id: null, topic_label: "", answer_json: null },
        { journey_id: "journey-beta", parent_turn_id: "turn-beta", topic_label: "Oceanography", answer_json: null },
      ];
    }
    throw new Error(`Unexpected ${method} query: ${sql}`);
  });
  env.DB = db;

  const result = await listJourneys(viewer);

  assert.deepEqual(result.map(({ id, pinned, hidden, createdAt, topicLabels }) => ({ id, pinned, hidden, createdAt, topicLabels })), [
    {
      id: "journey-alpha",
      pinned: true,
      hidden: false,
      createdAt: 700,
      topicLabels: ["Bioluminescence", "Evolution"],
    },
    {
      id: "journey-beta",
      pinned: false,
      hidden: true,
      createdAt: 700,
      topicLabels: ["Oceanography"],
    },
  ]);
  assert.match(normalizedSql(db.calls[0]), /owner_identity_id = \? AND deleted_at IS NULL ORDER BY updated_at DESC/);
  assert.match(normalizedSql(db.calls[0]), /version, created_at, updated_at/);
  assert.deepEqual(db.calls[0].bindings, [viewer.identityId]);
  assert.match(normalizedSql(db.calls[1]), /status = 'ready' ORDER BY created_at/);
  assert.deepEqual(db.calls[1].bindings, ["journey-alpha", "journey-beta"]);
  assert.equal(result[0].leadMedia?.imageUrl, "https://images.example/firefly.jpg");
});

test("listJourneys does not issue a topic query for an empty owned library", async () => {
  const db = createScriptedD1((call, method) => {
    assert.equal(method, "all");
    assert.match(normalizedSql(call), /FROM journeys/);
    return [];
  });
  env.DB = db;

  assert.deepEqual(await listJourneys(viewer), []);
  assert.equal(db.calls.length, 1);
});

test("getJourney preserves hydration ordering, current option sets, legacy fallbacks, and metadata defaults", async () => {
  const validMedia = {
    imageUrl: "https://images.example/firefly.jpg",
    sourcePageUrl: "https://example.org/fireflies",
    caption: "A firefly",
    alt: "A glowing firefly",
  };
  const db = createScriptedD1((call, method) => {
    const sql = normalizedSql(call);
    if (method === "first" && sql.includes("FROM journeys")) return journeyRow();
    if (method !== "all") throw new Error(`Unexpected ${method} query: ${sql}`);
    if (sql.includes("FROM turns t LEFT JOIN research_runs")) {
      return [
        turnRow({
          answer_json: JSON.stringify({
            blocks: [{ text: "Structured answer", sourceIds: ["source-1"] }],
            media: [validMedia, { imageUrl: "https://invalid.example/image.jpg" }],
          }),
          research_handoff_json: JSON.stringify({
            discoveries: ["Light is chemically produced", 42],
            uncertainties: ["Signal variation"],
            unresolvedThreads: "not-an-array",
            sourceLeads: ["Primary paper"],
          }),
          run_provider: "openai",
          turn_provider: "OpenAI Responses",
          turn_model_id: "gpt-5.6-sol",
          prompt_version: "prompt@stored",
          performer_version: "sage@stored",
          model_snapshot: "snapshot@stored",
          turn_answer_density: "rich",
          turn_image_preference: "prefer",
          turn_output_locale: "fr",
          provider_response_id: "response-1",
          input_tokens: 120,
          cached_input_tokens: 20,
          output_tokens: 30,
          reasoning_tokens: 10,
          total_tokens: 160,
          web_search_calls: 2,
          page_fetches: 3,
          latency_ms: 450,
          estimated_cost_microusd: 1_250_000,
          rate_effective_at: "2026-07-14",
        }),
        turnRow({
          id: "turn-child",
          parent_turn_id: "turn-current",
          depth: 1,
          question: "How did the signal evolve?",
          answer: "First paragraph.\n\nSecond paragraph.",
          answer_json: "{malformed",
          transition: null,
          topic_label: null,
          research_summary: null,
          research_handoff_json: "[invalid-object]",
          preferred_position: 9,
          option_set_version: 1,
          created_at: 200,
        }),
      ];
    }
    if (sql.includes("FROM turn_options o JOIN turns")) {
      return [
        { id: "option-b", turn_id: "turn-current", position: 1, question: "Path B?", angle: "B", state: "proposed" },
        { id: "option-a", turn_id: "turn-current", position: 0, question: "Path A?", angle: "A", state: "chosen" },
      ];
    }
    if (sql.includes("FROM turn_sources")) {
      return [{
        turn_id: "turn-current",
        id: "source-1",
        title: "Firefly source",
        publisher: "Example Institute",
        canonical_url: "https://example.org/fireflies",
        relation: "cited",
        published_at: null,
        retrieved_at: 50,
        warning: null,
        license_note: "Open",
      }];
    }
    if (sql.includes("FROM research_events")) {
      return [{
        turn_id: "turn-current",
        id: "event-1",
        sequence: 2,
        kind: "source",
        label: "Read source",
        source_id: "source-1",
      }];
    }
    if (sql.includes("FROM turn_actions")) {
      return [
        {
          id: "action-1",
          turn_id: "turn-current",
          kind: "delegate",
          option_id: "option-a",
          result_turn_id: "turn-child",
          metadata_json: JSON.stringify({ reason: "Surprise me", adventure: 88 }),
          created_at: 300,
        },
        {
          id: "action-2",
          turn_id: "turn-child",
          kind: "pause",
          option_id: null,
          result_turn_id: null,
          metadata_json: "{malformed",
          created_at: 400,
        },
      ];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  env.DB = db;

  const result = await getJourney(viewer, "journey-alpha");

  assert.deepEqual(result.topicLabels, ["Bioluminescence"]);
  assert.deepEqual(result.turns[0].answerBlocks, [{ text: "Structured answer", sourceIds: ["source-1"] }]);
  assert.deepEqual(result.turns[0].media, [validMedia]);
  assert.deepEqual(result.turns[0].researchHandoff, {
    discoveries: ["Light is chemically produced"],
    uncertainties: ["Signal variation"],
    unresolvedThreads: [],
    sourceLeads: ["Primary paper"],
  });
  assert.deepEqual(result.turns[0].options.map((option) => option.id), ["option-b", "option-a"]);
  assert.equal(result.turns[0].research.mode, "live");
  assert.equal(result.turns[0].research.usage.estimatedCostUsd, 1.25);
  assert.deepEqual(result.turns[0].metadata, {
    performerId: "sage",
    performerVersion: "sage@stored",
    provider: "OpenAI Responses",
    modelId: "gpt-5.6-sol",
    modelSnapshot: "snapshot@stored",
    researchPreset: "standard",
    answerDensity: "rich",
    imagePreference: "prefer",
    outputLocale: "fr",
    promptVersion: "prompt@stored",
    researchedAt: 100,
  });
  assert.deepEqual(result.turns[1].answerBlocks, [
    { text: "First paragraph.", sourceIds: [] },
    { text: "Second paragraph.", sourceIds: [] },
  ]);
  assert.deepEqual(result.turns[1].researchHandoff, {
    discoveries: [], uncertainties: [], unresolvedThreads: [], sourceLeads: [],
  });
  assert.equal(result.turns[1].preferredPosition, 0);
  assert.equal(result.turns[1].transition, "");
  assert.equal(result.turns[1].topicLabel, "open question");
  assert.equal(result.turns[1].metadata.performerVersion, "sage@1.0.0");
  assert.equal(result.turns[1].metadata.modelSnapshot, "openai:gpt-5.6-terra@2026-07-14");
  assert.deepEqual(result.actions.map(({ reason, adventure }) => ({ reason, adventure })), [
    { reason: "Surprise me", adventure: 88 },
    { reason: null, adventure: null },
  ]);

  assert.equal(db.calls.length, 6);
  assert.deepEqual(db.calls[0].bindings, ["journey-alpha", viewer.identityId]);
  const hydrationSql = db.calls.slice(1).map(normalizedSql);
  assert.ok(hydrationSql.every((sql) => sql.includes("ORDER BY")));
  assert.ok(hydrationSql.some((sql) => sql.includes("t.option_set_version = o.set_version")));
  assert.ok(hydrationSql.some((sql) => sql.includes("t.status = 'ready' ORDER BY t.created_at, t.depth")));
  assert.ok(db.calls.slice(1).every((call) => call.bindings[0] === "journey-alpha"));
});

test("getJourney rejects an unowned or deleted journey before issuing child reads", async () => {
  const db = createScriptedD1((call, method) => {
    assert.equal(method, "first");
    assert.match(normalizedSql(call), /id = \? AND owner_identity_id = \? AND deleted_at IS NULL LIMIT 1/);
    return null;
  });
  env.DB = db;

  await assert.rejects(
    () => getJourney(viewer, "journey-missing"),
    (error) => error?.code === "NOT_FOUND"
      && error?.status === 404
      && error?.message === "That saved journey was not found.",
  );
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].bindings, ["journey-missing", viewer.identityId]);
});

test("listRejectedQuestions preserves full journey authorization and historical ordering", async () => {
  const db = createScriptedD1((call, method) => {
    const sql = normalizedSql(call);
    if (method === "all" && sql.includes("SELECT o.question FROM turn_options")) {
      return [{ question: "Rejected first?" }, { question: "Rejected later?" }];
    }
    return emptyHydrationResponse(call, method);
  });
  env.DB = db;

  assert.deepEqual(await listRejectedQuestions(viewer, "journey-alpha"), [
    "Rejected first?",
    "Rejected later?",
  ]);
  assert.equal(db.calls.length, 7);
  const rejectedCall = db.calls.at(-1);
  assert.match(
    normalizedSql(rejectedCall),
    /o.state = 'rejected' ORDER BY t.created_at, o.set_version, o.position/,
  );
  assert.deepEqual(rejectedCall.bindings, ["journey-alpha"]);
});

test("compareJourneys rejects the same journey before issuing reads", async () => {
  const db = createScriptedD1(() => {
    throw new Error("Comparison should not query D1 for identical journey IDs.");
  });
  env.DB = db;

  await assert.rejects(
    () => compareJourneys(viewer, "journey-alpha", "journey-alpha"),
    (error) => error?.code === "BAD_REQUEST"
      && error?.status === 400
      && error?.message === "Choose two different journeys to compare.",
  );
  assert.equal(db.calls.length, 0);
});

test("compareJourneys preserves authorization, projection ordering, observations, and confounders", async () => {
  const db = createScriptedD1((call, method) => {
    const sql = normalizedSql(call);
    const journeyId = call.bindings[0];
    if (method === "first" && sql.includes("FROM journeys")) {
      if (journeyId === "journey-left") {
        return journeyRow({
          id: "journey-left",
          seed: "A shared beginning",
          title: "Left trail",
          current_turn_id: "left-child",
          turn_count: 2,
          source_count: 2,
        });
      }
      if (journeyId === "journey-right") {
        return journeyRow({
          id: "journey-right",
          seed: "A shared beginning",
          title: "Right trail",
          performer_id: "spark",
          current_turn_id: "right-root",
          turn_count: 1,
          source_count: 1,
        });
      }
    }
    if (method !== "all") throw new Error(`Unexpected ${method} query: ${sql}`);
    if (sql.includes("FROM turns t LEFT JOIN research_runs")) {
      if (journeyId === "journey-left") {
        return [
          turnRow({
            id: "left-root",
            question: "Where did the pattern begin?",
            topic_label: "Shared topic",
            transition: "First transition",
            estimated_cost_microusd: 1_250_000,
            created_at: 100,
          }),
          turnRow({
            id: "left-child",
            parent_turn_id: "left-root",
            depth: 1,
            question: "What changed next?",
            topic_label: "Left only",
            transition: "Second transition",
            estimated_cost_microusd: 750_000,
            created_at: 200,
          }),
        ];
      }
      return [turnRow({
        id: "right-root",
        question: "How else could it unfold?",
        topic_label: "Shared topic",
        transition: "Other transition",
        estimated_cost_microusd: 500_000,
        created_at: 150,
      }), turnRow({
        id: "right-hidden-topic",
        question: "Which boundary matters?",
        topic_label: "Right only",
        transition: "Boundary transition",
        estimated_cost_microusd: 0,
        created_at: 250,
      })];
    }
    if (sql.includes("FROM turn_options o JOIN turns")) return [];
    if (sql.includes("FROM turn_sources")) {
      if (journeyId === "journey-left") {
        return [
          { turn_id: "left-root", id: "source-left-1", title: "One", publisher: "Example", canonical_url: "https://example.org/one", relation: "cited", published_at: null, retrieved_at: 10, warning: null, license_note: null },
          { turn_id: "left-child", id: "source-left-2", title: "Two", publisher: "Example", canonical_url: "https://example.org/two", relation: "cited", published_at: null, retrieved_at: 20, warning: null, license_note: null },
        ];
      }
      return [{ turn_id: "right-root", id: "source-right-1", title: "Three", publisher: "Example", canonical_url: "https://example.org/three", relation: "cited", published_at: null, retrieved_at: 30, warning: null, license_note: null }];
    }
    if (sql.includes("FROM research_events")) return [];
    if (sql.includes("FROM turn_actions")) {
      if (journeyId === "journey-left") {
        return [
          { id: "action-reject", turn_id: "left-root", kind: "reject", option_id: null, result_turn_id: null, metadata_json: null, created_at: 300 },
          { id: "action-delegate", turn_id: "left-root", kind: "delegate", option_id: "option-left", result_turn_id: "left-child", metadata_json: null, created_at: 400 },
        ];
      }
      return [];
    }
    throw new Error(`Unexpected query: ${sql}`);
  });
  env.DB = db;

  const result = await compareJourneys(viewer, "journey-left", "journey-right");

  assert.deepEqual(result.sharedTopics, ["Shared topic"]);
  assert.deepEqual(result.leftOnlyTopics, ["Left only"]);
  assert.deepEqual(result.rightOnlyTopics, ["Right only"]);
  assert.deepEqual(
    {
      performerName: result.left.performerName,
      modelName: result.left.modelName,
      actionCount: result.left.actionCount,
      rejectedCount: result.left.rejectedCount,
      delegatedCount: result.left.delegatedCount,
      totalEstimatedCostUsd: result.left.totalEstimatedCostUsd,
      timeline: result.left.timeline,
    },
    {
      performerName: "Sage",
      modelName: "GPT-5.6 Terra",
      actionCount: 2,
      rejectedCount: 1,
      delegatedCount: 1,
      totalEstimatedCostUsd: 2,
      timeline: [
        { turnId: "left-root", question: "Where did the pattern begin?", topicLabel: "Shared topic", transition: "First transition", researchedAt: 100, sourceCount: 1 },
        { turnId: "left-child", question: "What changed next?", topicLabel: "Left only", transition: "Second transition", researchedAt: 200, sourceCount: 1 },
      ],
    },
  );
  assert.equal(result.right.performerName, "Spark");
  assert.equal(result.right.totalEstimatedCostUsd, 0.5);
  assert.deepEqual(result.observations, [
    { key: "Both journeys touched {topics}.", values: { topics: "Shared topic" } },
    { key: "They used different performers, so both path and persona shape the contrast." },
    { key: "{leftTitle} contains {leftCount} turns; {rightTitle} contains {rightCount}.", values: { leftTitle: "Left trail", leftCount: 2, rightTitle: "Right trail", rightCount: 1 } },
  ]);
  assert.deepEqual(result.confounders, [
    { key: "Live-web evidence can change between research dates." },
    { key: "Audience choices and rejected paths change the context of later turns." },
    { key: "Model output is stochastic; this view is descriptive, not a winner ranking." },
    { key: "Both journeys began from the same seed." },
  ]);
  const parentReads = db.calls.filter((call) => normalizedSql(call).includes("FROM journeys"));
  assert.deepEqual(parentReads.map((call) => call.bindings), [
    ["journey-left", viewer.identityId],
    ["journey-right", viewer.identityId],
  ]);
});
