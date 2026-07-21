import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
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
    lead_answer_json: JSON.stringify({ blocks: [], media: [{ imageUrl: "https://images.example/firefly.jpg", sourcePageUrl: "https://example.org/fireflies", caption: "A firefly", alt: "A glowing firefly" }] }),
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
          lead_answer_json: null,
        }),
      ];
    }
    if (method === "all" && sql.includes("SELECT journey_id, topic_label FROM turns")) {
      return [
        { journey_id: "journey-alpha", topic_label: "Bioluminescence" },
        { journey_id: "journey-alpha", topic_label: "Bioluminescence" },
        { journey_id: "journey-alpha", topic_label: "Evolution" },
        { journey_id: "journey-beta", topic_label: "" },
        { journey_id: "journey-beta", topic_label: "Oceanography" },
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
  assert.match(normalizedSql(db.calls[0]), /AS lead_answer_json/);
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
