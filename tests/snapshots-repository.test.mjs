import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
  createSnapshot,
  exportJourney,
  listSnapshots,
} from "../lib/snapshots-repository.ts";

const viewer = {
  identityId: "identity-owner",
  mode: "chatgpt",
  displayName: "Owner",
  journeyLimit: 0,
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
    pinned: 0,
    hidden: 0,
    current_turn_id: "turn-current",
    turn_count: 2,
    source_count: 0,
    status: "active",
    version: 7,
    updated_at: 900,
    open_branch_count: 1,
    ...changes,
  };
}

function turnRow(changes = {}) {
  return {
    id: "turn-opening",
    parent_turn_id: null,
    depth: 0,
    question: "Why do fireflies glow?",
    answer: "An answer",
    answer_json: null,
    transition: "Opening",
    topic_label: "Bioluminescence",
    research_summary: "A compact summary",
    research_handoff_json: JSON.stringify({
      discoveries: ["Light is chemically produced"],
      uncertainties: [],
      unresolvedThreads: ["Opening thread"],
      sourceLeads: [],
    }),
    preferred_position: 0,
    option_set_version: 1,
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

function normalizedSql(call) {
  return call.sql.replace(/\s+/g, " ").trim();
}

function createSnapshotD1({ owned = true, journey = journeyRow(), turns, snapshots = [] } = {}) {
  const calls = [];
  const readyTurns = turns ?? [
    turnRow(),
    turnRow({
      id: "turn-current",
      parent_turn_id: "turn-opening",
      depth: 1,
      question: "How does the glow become a signal?",
      topic_label: "Signaling",
      research_handoff_json: JSON.stringify({
        discoveries: ["A later discovery"],
        uncertainties: [],
        unresolvedThreads: ["First open question", "Second open question", "Ignored third question"],
        sourceLeads: [],
      }),
      created_at: 200,
    }),
  ];
  return {
    calls,
    prepare(sql) {
      const call = { sql, bindings: [], methods: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async first() {
          call.methods.push("first");
          return owned ? { ...journey } : null;
        },
        async all() {
          call.methods.push("all");
          const normalized = normalizedSql(call);
          if (normalized.includes("FROM turns t LEFT JOIN research_runs")) return { results: readyTurns };
          if (normalized.startsWith("SELECT id, journey_id, label, graph_version, summary, created_at FROM snapshots")) {
            return { results: snapshots };
          }
          return { results: [] };
        },
        async run() {
          call.methods.push("run");
          return { meta: { changes: 1 } };
        },
      };
    },
  };
}

function installFixedGlobals({ now = 1_784_395_445_000, dateLabel = "7/18/2026", uuid = "snapshot-fixed" } = {}) {
  const OriginalDate = globalThis.Date;
  const originalRandomUUID = globalThis.crypto.randomUUID;
  const dateLocales = [];
  class FixedDate extends OriginalDate {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }

    toLocaleDateString(locale, options) {
      dateLocales.push([locale, options]);
      return dateLabel;
    }
  }
  globalThis.Date = FixedDate;
  globalThis.crypto.randomUUID = () => uuid;
  return {
    dateLocales,
    restore() {
      globalThis.Date = OriginalDate;
      globalThis.crypto.randomUUID = originalRandomUUID;
    },
  };
}

function journeyAuthorizationCalls(db) {
  return db.calls.filter((call) => normalizedSql(call).includes("FROM journeys") && call.methods.includes("first"));
}

test("snapshot creation preserves label normalization, summary, generated values, stored JSON, SQL, and bind order", async () => {
  const db = createSnapshotD1();
  env.DB = db;
  const globals = installFixedGlobals();
  let result;
  try {
    result = await createSnapshot(viewer, "journey-alpha", `  ${"x".repeat(79)}   ending  `);
  } finally {
    globals.restore();
  }

  const expectedSummary = "Firefly trail has visited Bioluminescence, Signaling across 2 turns. "
    + "The active route currently rests at “How does the glow become a signal?”. "
    + "A notable discovery: Light is chemically produced Still open: First open question; Second open question "
    + "1 visible branch remains open.";
  assert.deepEqual(result, {
    id: "snapshot-fixed",
    journeyId: "journey-alpha",
    label: `${"x".repeat(79)} `,
    graphVersion: 7,
    summary: expectedSummary,
    createdAt: 1_784_395_445_000,
  });

  const insert = db.calls.find((call) => normalizedSql(call).startsWith("INSERT INTO snapshots"));
  assert.ok(insert);
  assert.equal(
    normalizedSql(insert),
    "INSERT INTO snapshots (id, journey_id, owner_identity_id, label, graph_version, summary, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  assert.deepEqual(insert.bindings, [
    "snapshot-fixed",
    "journey-alpha",
    viewer.identityId,
    `${"x".repeat(79)} `,
    7,
    expectedSummary,
    '{"topicLabels":["Bioluminescence","Signaling"],"currentTurnId":"turn-current"}',
    1_784_395_445_000,
  ]);
  assert.deepEqual(insert.methods, ["run"]);
  assert.equal(journeyAuthorizationCalls(db).length, 1);
  assert.deepEqual(journeyAuthorizationCalls(db)[0].bindings, ["journey-alpha", viewer.identityId]);
  assert.equal(
    db.calls.filter((call) => /FROM snapshots/i.test(normalizedSql(call)) && /COUNT|DELETE|LIMIT/i.test(normalizedSql(call))).length,
    0,
    "snapshot creation currently has no capacity, eviction, or retention query",
  );
});

test("snapshot creation preserves the local en-US default label and final-turn fallback", async () => {
  const db = createSnapshotD1({
    journey: journeyRow({ current_turn_id: "turn-missing", turn_count: 1, open_branch_count: 0 }),
    turns: [turnRow({
      id: "turn-final",
      topic_label: "",
      research_handoff_json: JSON.stringify({
        discoveries: [], uncertainties: [], unresolvedThreads: [], sourceLeads: [],
      }),
    })],
  });
  env.DB = db;
  const globals = installFixedGlobals();
  let result;
  try {
    result = await createSnapshot(viewer, "journey-alpha", " \n\t ");
  } finally {
    globals.restore();
  }

  assert.equal(result.label, "Snapshot 7/18/2026");
  assert.deepEqual(globals.dateLocales, [["en-US", undefined]]);
  assert.equal(
    result.summary,
    "Firefly trail has visited an opening question across 1 turn. "
      + "The active route currently rests at “Why do fireflies glow?”. 0 visible branches remain open.",
  );
});

test("snapshot operations preserve identity-bound authorization before snapshot persistence", async () => {
  for (const [name, operation, expectedReads] of [
    ["create", () => createSnapshot(viewer, "journey-other", "Label"), 1],
    ["list", () => listSnapshots(viewer, "journey-other"), 1],
    ["export", () => exportJourney(viewer, "journey-other"), 2],
  ]) {
    const db = createSnapshotD1({ owned: false });
    env.DB = db;
    await assert.rejects(
      operation,
      (error) => error?.code === "NOT_FOUND"
        && error?.status === 404
        && error?.retryable === false
        && error?.message === "That saved journey was not found.",
      name,
    );
    assert.equal(journeyAuthorizationCalls(db).length, expectedReads, name);
    assert.ok(journeyAuthorizationCalls(db).every((call) => (
      /WHERE id = \? AND owner_identity_id = \? AND deleted_at IS NULL LIMIT 1$/.test(normalizedSql(call))
      && assert.deepEqual(call.bindings, ["journey-other", viewer.identityId]) === undefined
    )));
    assert.equal(db.calls.some((call) => /^(INSERT INTO snapshots|SELECT id, journey_id.* FROM snapshots)/.test(normalizedSql(call))), false, name);
  }
});

test("snapshot listing preserves exact SQL, bind order, descending row projection, and hidden stored JSON", async () => {
  const db = createSnapshotD1({
    snapshots: [
      { id: "snapshot-new", journey_id: "journey-alpha", label: "New", graph_version: 7, summary: "New summary", created_at: 200 },
      { id: "snapshot-old", journey_id: "journey-alpha", label: "Old", graph_version: 3, summary: "Old summary", created_at: 100 },
    ],
  });
  env.DB = db;

  assert.deepEqual(await listSnapshots(viewer, "journey-alpha"), [
    { id: "snapshot-new", journeyId: "journey-alpha", label: "New", graphVersion: 7, summary: "New summary", createdAt: 200 },
    { id: "snapshot-old", journeyId: "journey-alpha", label: "Old", graphVersion: 3, summary: "Old summary", createdAt: 100 },
  ]);
  const select = db.calls.find((call) => normalizedSql(call).startsWith("SELECT id, journey_id, label, graph_version, summary, created_at FROM snapshots"));
  assert.ok(select);
  assert.equal(
    normalizedSql(select),
    "SELECT id, journey_id, label, graph_version, summary, created_at FROM snapshots WHERE journey_id = ? AND owner_identity_id = ? ORDER BY created_at DESC",
  );
  assert.deepEqual(select.bindings, ["journey-alpha", viewer.identityId]);
  assert.deepEqual(select.methods, ["all"]);
  assert.equal(normalizedSql(select).includes("snapshot_json"), false);
});

test("export preserves shape, privacy text, clock, snapshot projection, and duplicate journey reads", async () => {
  const db = createSnapshotD1({
    snapshots: [
      { id: "snapshot-one", journey_id: "journey-alpha", label: "One", graph_version: 7, summary: "Snapshot summary", created_at: 300 },
    ],
  });
  env.DB = db;
  const globals = installFixedGlobals();
  let result;
  try {
    result = await exportJourney(viewer, "journey-alpha");
  } finally {
    globals.restore();
  }

  assert.deepEqual(Object.keys(result), [
    "exportVersion", "exportedAt", "catalogVersion", "journey", "snapshots", "privacy",
  ]);
  assert.equal(result.exportVersion, "curiositypedia-export@1");
  assert.equal(result.exportedAt, "2026-07-18T17:24:05.000Z");
  assert.equal(result.catalogVersion, "wonder-research-turn@4.1.3");
  assert.equal(result.journey.id, "journey-alpha");
  assert.deepEqual(result.snapshots, [
    { id: "snapshot-one", journeyId: "journey-alpha", label: "One", graphVersion: 7, summary: "Snapshot summary", createdAt: 300 },
  ]);
  assert.deepEqual(result.privacy, {
    includes: "Visible journey content, actions, sources, metadata, and saved snapshots.",
    excludes: "API keys, cookies, private provider reasoning, raw source bodies, and internal prompts.",
  });

  const authorizationCalls = journeyAuthorizationCalls(db);
  assert.equal(authorizationCalls.length, 2);
  assert.ok(authorizationCalls.every((call) => (
    assert.deepEqual(call.bindings, ["journey-alpha", viewer.identityId]) === undefined
  )));
  assert.equal(db.calls.filter((call) => call.methods.includes("all")).length, 11);
  assert.equal(db.calls.filter((call) => normalizedSql(call).includes("FROM snapshots")).length, 1);
});
