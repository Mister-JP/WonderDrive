import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
  assertLiveResearchLease,
  commitLiveResearch,
  LIVE_RESEARCH_LEASE_MS,
  markLiveResearchFailed,
  prepareBackgroundLiveResearch,
  prepareLiveResearch,
  renewLiveResearchLease,
} from "../lib/live-repository.ts";

const viewer = {
  identityId: "identity-owner",
  mode: "chatgpt",
  displayName: "Owner",
  journeyLimit: 25,
};

class SQLiteD1 {
  constructor(database) {
    this.database = database;
    this.afterFirst = null;
  }

  prepare(sql) {
    const database = this.database;
    const notifyFirst = (bindings, row) => this.afterFirst?.(sql, bindings, row);
    let bindings = [];
    return {
      sql,
      bind(...values) {
        bindings = values;
        return this;
      },
      async first() {
        const row = database.prepare(sql).get(...bindings) ?? null;
        notifyFirst(bindings, row);
        return row;
      },
      async all() {
        return {
          success: true,
          results: database.prepare(sql).all(...bindings),
          meta: { changes: 0 },
        };
      },
      async run() {
        const result = database.prepare(sql).run(...bindings);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
      runSync() {
        const result = database.prepare(sql).run(...bindings);
        return { success: true, meta: { changes: Number(result.changes) } };
      },
    };
  }

  async batch(statements) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map((statement) => statement.runSync());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

function migratedDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  for (const migration of readdirSync("drizzle").filter((name) => /^\d{4}.*\.sql$/.test(name)).sort()) {
    const sql = readFileSync(`drizzle/${migration}`, "utf8");
    for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      database.exec(statement);
    }
  }
  database.prepare(
    `INSERT INTO identities (id, provider, provider_subject)
     VALUES (?, 'chatgpt', ?)`,
  ).run(viewer.identityId, "subject-owner");
  return database;
}

function createRequest(idempotencyKey, changes = {}) {
  return {
    kind: "create",
    seed: "How do migrating birds navigate?",
    performerId: "sage",
    modelId: "gpt-5.6-luna",
    researchPreset: "spark",
    answerDensity: "brief",
    outputLocale: "en",
    idempotencyKey,
    ...changes,
  };
}

function preparedRequest(changes = {}) {
  return {
    requestId: "request-stale",
    leaseToken: "lease-current",
    identityId: viewer.identityId,
    viewerMode: viewer.mode,
    kind: "create",
    question: "How do migrating birds navigate?",
    seed: "How do migrating birds navigate?",
    depth: 0,
    performerId: "sage",
    modelId: "gpt-5.6-luna",
    researchPreset: "spark",
    answerDensity: "brief",
    imagePreference: "prefer",
    outputLocale: "en",
    topicTrail: [],
    idempotencyKey: "key-stale",
    payloadHash: "hash-stale",
    ...changes,
  };
}

function draft() {
  return {
    topicLabel: "Navigation",
    answer: "A sufficiently long test answer.",
    answerBlocks: [],
    media: [],
    transition: "A transition",
    researchSummary: "A summary",
    researchHandoff: { summary: "Summary", keyFindings: [], openQuestions: [] },
    preferredPosition: 0,
    options: [
      { question: "How does magnetic sensing work?", angle: "Mechanism" },
      { question: "How do stars guide birds?", angle: "Observation" },
    ],
    sources: [],
    researchEvents: [],
    providerResponseId: "response-test",
    usage: {
      inputTokens: 10,
      cachedInputTokens: 0,
      outputTokens: 20,
      reasoningTokens: 5,
      totalTokens: 35,
      webSearchCalls: 1,
      pageFetches: 0,
      latencyMs: 100,
      estimatedCostUsd: 0.01,
      rateEffectiveAt: "2026-07-14",
    },
  };
}

function insertResearchRequest(database, prepared, status = "researching") {
  database.prepare(
    `INSERT INTO research_requests
      (id, identity_id, kind, idempotency_key, payload_hash, request_json, status,
       lease_token, lease_expires_at, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, '{}', ?, ?, CAST(unixepoch() * 1000 AS INTEGER) + ?,
       CAST(unixepoch() * 1000 AS INTEGER), CAST(unixepoch() * 1000 AS INTEGER))`,
  ).run(
    prepared.requestId,
    prepared.identityId,
    prepared.kind,
    prepared.idempotencyKey,
    prepared.payloadHash,
    status,
    prepared.leaseToken,
    LIVE_RESEARCH_LEASE_MS,
  );
}

function invalidateAfterPreflight(d1, requestId) {
  let invalidated = false;
  d1.afterFirst = (sql) => {
    if (invalidated || !sql.includes("SELECT id FROM research_requests") || !sql.includes("lease_token = ?")) return;
    invalidated = true;
    d1.database.prepare(
      `UPDATE research_requests
       SET status = 'failed', error_code = 'TAKEN_OVER', lease_token = 'lease-new-owner'
       WHERE id = ?`,
    ).run(requestId);
  };
}

function count(database, table) {
  return Number(database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count);
}

test("migration chain installs renewable lease columns and one-active-request uniqueness", () => {
  const database = migratedDatabase();
  const columns = new Set(database.prepare("PRAGMA table_info(research_requests)").all().map((row) => row.name));
  assert.ok(columns.has("lease_token"));
  assert.ok(columns.has("lease_expires_at"));
  const indexes = new Set(
    database.prepare("PRAGMA index_list(research_requests)").all().map((row) => row.name),
  );
  assert.ok(indexes.has("research_requests_identity_active_unique"));

  const first = preparedRequest();
  insertResearchRequest(database, first);
  assert.throws(
    () => insertResearchRequest(database, preparedRequest({ requestId: "request-two", idempotencyKey: "key-two" })),
    /UNIQUE constraint failed/,
  );
});

test("simultaneous ordinary acquisitions produce exactly one active owner", async () => {
  const database = migratedDatabase();
  env.DB = new SQLiteD1(database);
  try {
    const outcomes = await Promise.allSettled([
      prepareLiveResearch(viewer, createRequest("key-first")),
      prepareLiveResearch(viewer, createRequest("key-second")),
    ]);
    assert.equal(outcomes.filter(({ status }) => status === "fulfilled").length, 1);
    const fulfilled = outcomes.find(({ status }) => status === "fulfilled");
    assert.equal(fulfilled.value.prepared.imagePreference, "prefer");
    const rejected = outcomes.find(({ status }) => status === "rejected");
    assert.equal(rejected.reason.code, "ALREADY_IN_PROGRESS");
    assert.equal(
      count(database, "research_requests"),
      1,
    );
    assert.equal(
      database.prepare("SELECT COUNT(*) AS count FROM research_requests WHERE status = 'researching'").get().count,
      1,
    );
  } finally {
    delete env.DB;
  }
});

test("takeover targets the observed request so a second takeover cannot replace the winner", async () => {
  const database = migratedDatabase();
  const original = preparedRequest({ requestId: "request-original", idempotencyKey: "key-original" });
  insertResearchRequest(database, original);
  env.DB = new SQLiteD1(database);
  try {
    const first = await prepareLiveResearch(
      viewer,
      createRequest("key-takeover-one", {
        takeoverExisting: true,
        takeoverRequestId: original.requestId,
      }),
    );
    assert.equal(first.type, "ready");
    await assert.rejects(
      () => prepareLiveResearch(
        viewer,
        createRequest("key-takeover-two", {
          takeoverExisting: true,
          takeoverRequestId: original.requestId,
        }),
      ),
      (error) => error?.code === "ALREADY_IN_PROGRESS" && error?.retryable === false,
    );
    const active = database.prepare(
      "SELECT id FROM research_requests WHERE status = 'researching'",
    ).all();
    assert.deepEqual(active.map((row) => row.id), [first.prepared.requestId]);
    assert.equal(
      database.prepare("SELECT error_code FROM research_requests WHERE id = ?").get(original.requestId).error_code,
      "TAKEN_OVER",
    );
  } finally {
    delete env.DB;
  }
});

test("renewal extends only the current unexpired token", async () => {
  const database = migratedDatabase();
  const prepared = preparedRequest();
  insertResearchRequest(database, prepared);
  env.DB = new SQLiteD1(database);
  try {
    const before = Number(
      database.prepare("SELECT lease_expires_at FROM research_requests WHERE id = ?").get(prepared.requestId).lease_expires_at,
    );
    await assertLiveResearchLease(viewer, prepared);
    await renewLiveResearchLease(viewer, prepared);
    const after = Number(
      database.prepare("SELECT lease_expires_at FROM research_requests WHERE id = ?").get(prepared.requestId).lease_expires_at,
    );
    assert.ok(after >= before);

    database.prepare("UPDATE research_requests SET lease_token = 'replacement-token' WHERE id = ?").run(prepared.requestId);
    await assert.rejects(
      () => renewLiveResearchLease(viewer, prepared),
      (error) => error?.code === "ALREADY_IN_PROGRESS" && error?.retryable === false,
    );
  } finally {
    delete env.DB;
  }
});

test("a stale worker cannot overwrite the winner's terminal takeover reason", async () => {
  const database = migratedDatabase();
  const prepared = preparedRequest();
  insertResearchRequest(database, prepared);
  database.prepare(
    `UPDATE research_requests
     SET status = 'failed', error_code = 'TAKEN_OVER',
         error_message = 'This run was moved to another tab.', lease_token = 'winner-token'
     WHERE id = ?`,
  ).run(prepared.requestId);
  env.DB = new SQLiteD1(database);
  try {
    await markLiveResearchFailed(viewer, prepared, new Error("late stale failure"));
    assert.deepEqual(
      { ...database.prepare(
        "SELECT status, error_code, error_message FROM research_requests WHERE id = ?",
      ).get(prepared.requestId) },
      {
        status: "failed",
        error_code: "TAKEN_OVER",
        error_message: "This run was moved to another tab.",
      },
    );
  } finally {
    delete env.DB;
  }
});

test("an expired request becomes terminal and ordinary acquisition recovers with a new key", async () => {
  const database = migratedDatabase();
  const expired = preparedRequest({ requestId: "request-expired", idempotencyKey: "key-expired" });
  insertResearchRequest(database, expired);
  database.prepare(
    `UPDATE research_requests
     SET lease_expires_at = CAST(unixepoch() * 1000 AS INTEGER) - 1
     WHERE id = ?`,
  ).run(expired.requestId);
  env.DB = new SQLiteD1(database);
  try {
    const recovered = await prepareLiveResearch(viewer, createRequest("key-recovered"));
    assert.equal(recovered.type, "ready");
    assert.deepEqual(
      { ...database.prepare(
        "SELECT status, error_code FROM research_requests WHERE id = ?",
      ).get(expired.requestId) },
      { status: "failed", error_code: "LEASE_EXPIRED" },
    );
    assert.equal(
      database.prepare("SELECT id FROM research_requests WHERE status = 'researching'").get().id,
      recovered.prepared.requestId,
    );
  } finally {
    delete env.DB;
  }
});

test("a current create lease commits one complete result and becomes replayable", async () => {
  const database = migratedDatabase();
  const prepared = preparedRequest({ requestId: "request-success", idempotencyKey: "key-success" });
  insertResearchRequest(database, prepared);
  env.DB = new SQLiteD1(database);
  try {
    const journey = await commitLiveResearch(viewer, prepared, draft());
    assert.equal(journey.turns.length, 1);
    assert.equal(count(database, "journeys"), 1);
    assert.equal(count(database, "turns"), 1);
    assert.equal(count(database, "turn_options"), 2);
    assert.equal(count(database, "research_runs"), 1);
    assert.equal(count(database, "usage_events"), 1);
    assert.deepEqual(
      { ...database.prepare(
        "SELECT status, result_journey_id FROM research_requests WHERE id = ?",
      ).get(prepared.requestId) },
      { status: "committed", result_journey_id: journey.id },
    );
  } finally {
    delete env.DB;
  }
});

test("a current advance lease commits one complete child and updates the journey once", async () => {
  const database = migratedDatabase();
  database.prepare(
    `INSERT INTO journeys
      (id, owner_identity_id, seed, title, performer_id, model_id, research_preset,
       answer_density, image_preference, output_locale, current_turn_id, version)
     VALUES ('journey-success', ?, 'Bird navigation', 'Bird navigation', 'sage',
       'gpt-5.6-luna', 'spark', 'brief', 'prefer', 'en', 'turn-parent', 1)`,
  ).run(viewer.identityId);
  database.prepare(
    `INSERT INTO turns (id, journey_id, question, status, topic_label, preferred_position)
     VALUES ('turn-parent', 'journey-success', 'How do birds navigate?', 'ready', 'Navigation', 0)`,
  ).run();
  database.prepare(
    `INSERT INTO turn_options (id, turn_id, set_version, position, question, angle, state)
     VALUES
       ('option-one', 'turn-parent', 0, 0, 'How does magnetic sensing work?', 'Mechanism', 'proposed'),
       ('option-two', 'turn-parent', 0, 1, 'How do stars guide birds?', 'Observation', 'proposed')`,
  ).run();
  const prepared = preparedRequest({
    kind: "advance",
    requestId: "request-advance-success",
    idempotencyKey: "key-advance-success",
    payloadHash: "hash-advance-success",
    journeyId: "journey-success",
    fromTurnId: "turn-parent",
    selectedOptionId: "option-one",
    action: "choose",
    expectedVersion: 1,
    depth: 1,
  });
  insertResearchRequest(database, prepared);
  env.DB = new SQLiteD1(database);
  try {
    const journey = await commitLiveResearch(viewer, prepared, draft());
    assert.equal(journey.turns.length, 2);
    assert.equal(journey.version, 2);
    assert.equal(count(database, "turns"), 2);
    assert.equal(count(database, "turn_actions"), 1);
    assert.equal(count(database, "journey_edges"), 2);
    assert.equal(count(database, "research_runs"), 1);
    assert.equal(count(database, "usage_events"), 1);
    assert.equal(
      database.prepare("SELECT status FROM research_requests WHERE id = ?").get(prepared.requestId).status,
      "committed",
    );
  } finally {
    delete env.DB;
  }
});

test("a child turn can be reserved as durable background research", async () => {
  const database = migratedDatabase();
  database.prepare(
    `INSERT INTO journeys
      (id, owner_identity_id, seed, title, performer_id, model_id, research_preset,
       answer_density, image_preference, output_locale, current_turn_id, version)
     VALUES ('journey-background-child', ?, 'Bird navigation', 'Bird navigation', 'sage',
       'gpt-5.6-luna', 'spark', 'brief', 'prefer', 'en', 'turn-background-parent', 1)`,
  ).run(viewer.identityId);
  database.prepare(
    `INSERT INTO turns (id, journey_id, question, status, topic_label, preferred_position)
     VALUES ('turn-background-parent', 'journey-background-child',
       'How do birds navigate?', 'ready', 'Navigation', 0)`,
  ).run();
  database.prepare(
    `INSERT INTO turn_options (id, turn_id, set_version, position, question, angle, state)
     VALUES
       ('option-background-one', 'turn-background-parent', 0, 0,
        'How does magnetic sensing work?', 'Mechanism', 'proposed'),
       ('option-background-two', 'turn-background-parent', 0, 1,
        'How do stars guide birds?', 'Observation', 'proposed')`,
  ).run();
  env.DB = new SQLiteD1(database);
  try {
    const result = await prepareBackgroundLiveResearch(viewer, {
      kind: "advance",
      journeyId: "journey-background-child",
      fromTurnId: "turn-background-parent",
      action: "choose",
      optionId: "option-background-one",
      expectedVersion: 1,
      idempotencyKey: "key-background-child",
    });
    assert.equal(result.type, "ready");
    assert.equal(result.prepared.kind, "advance");
    assert.equal(result.prepared.journeyId, "journey-background-child");
    assert.equal(result.prepared.fromTurnId, "turn-background-parent");
    assert.equal(result.prepared.selectedOptionId, "option-background-one");
    assert.deepEqual(
      { ...database.prepare(
        "SELECT kind, execution_mode, status FROM research_requests WHERE id = ?",
      ).get(result.prepared.requestId) },
      { kind: "advance", execution_mode: "background", status: "reserved" },
    );
  } finally {
    delete env.DB;
  }
});

test("a curiosity exploration commits a child in the same journey without a fake option", async () => {
  const database = migratedDatabase();
  database.prepare(
    `INSERT INTO journeys
      (id, owner_identity_id, seed, title, performer_id, model_id, research_preset,
       answer_density, image_preference, output_locale, current_turn_id, version)
     VALUES ('journey-curiosity', ?, 'Bird navigation', 'Bird navigation', 'sage',
       'gpt-5.6-luna', 'spark', 'brief', 'prefer', 'en', 'turn-parent', 1)`,
  ).run(viewer.identityId);
  database.prepare(
    `INSERT INTO turns (id, journey_id, question, status, topic_label, preferred_position)
     VALUES ('turn-parent', 'journey-curiosity', 'How do birds navigate?', 'ready', 'Navigation', 0)`,
  ).run();
  const prepared = preparedRequest({
    kind: "advance",
    requestId: "request-curiosity-success",
    idempotencyKey: "key-curiosity-success",
    payloadHash: "hash-curiosity-success",
    journeyId: "journey-curiosity",
    fromTurnId: "turn-parent",
    selectedOptionId: undefined,
    action: "explore",
    question: "Why do birds travel at night?",
    expectedVersion: 1,
    depth: 1,
  });
  insertResearchRequest(database, prepared);
  env.DB = new SQLiteD1(database);
  try {
    const journey = await commitLiveResearch(viewer, prepared, draft());
    assert.equal(journey.id, "journey-curiosity");
    assert.equal(journey.turns.length, 2);
    assert.equal(journey.turns[1].parentTurnId, "turn-parent");
    assert.equal(journey.turns[1].question, "Why do birds travel at night?");
    assert.deepEqual(
      { ...database.prepare("SELECT kind, option_id FROM turn_actions").get() },
      { kind: "explore", option_id: null },
    );
    assert.equal(count(database, "journey_edges"), 1);
  } finally {
    delete env.DB;
  }
});

test("a stale create worker cannot persist any partial journey data after preflight", async () => {
  const database = migratedDatabase();
  const prepared = preparedRequest();
  insertResearchRequest(database, prepared);
  const d1 = new SQLiteD1(database);
  invalidateAfterPreflight(d1, prepared.requestId);
  env.DB = d1;
  try {
    await assert.rejects(
      () => commitLiveResearch(viewer, prepared, draft()),
      (error) => error?.code === "ALREADY_IN_PROGRESS" && error?.retryable === false,
    );
    for (const table of [
      "journeys",
      "turns",
      "turn_options",
      "research_runs",
      "usage_events",
      "turn_actions",
      "journey_edges",
    ]) {
      assert.equal(count(database, table), 0, `${table} should remain empty`);
    }
  } finally {
    delete env.DB;
  }
});

test("a stale advance worker leaves the existing journey and options unchanged", async () => {
  const database = migratedDatabase();
  database.prepare(
    `INSERT INTO journeys
      (id, owner_identity_id, seed, title, performer_id, model_id, research_preset,
       answer_density, image_preference, output_locale, current_turn_id, version)
     VALUES ('journey-existing', ?, 'Bird navigation', 'Bird navigation', 'sage',
       'gpt-5.6-luna', 'spark', 'brief', 'prefer', 'en', 'turn-parent', 1)`,
  ).run(viewer.identityId);
  database.prepare(
    `INSERT INTO turns (id, journey_id, question, status, topic_label, preferred_position)
     VALUES ('turn-parent', 'journey-existing', 'How do birds navigate?', 'ready', 'Navigation', 0)`,
  ).run();
  database.prepare(
    `INSERT INTO turn_options (id, turn_id, set_version, position, question, angle, state)
     VALUES
       ('option-one', 'turn-parent', 0, 0, 'How does magnetic sensing work?', 'Mechanism', 'proposed'),
       ('option-two', 'turn-parent', 0, 1, 'How do stars guide birds?', 'Observation', 'proposed')`,
  ).run();
  const prepared = preparedRequest({
    kind: "advance",
    requestId: "request-advance",
    idempotencyKey: "key-advance",
    payloadHash: "hash-advance",
    journeyId: "journey-existing",
    fromTurnId: "turn-parent",
    selectedOptionId: "option-one",
    action: "choose",
    expectedVersion: 1,
    depth: 1,
  });
  insertResearchRequest(database, prepared);
  const d1 = new SQLiteD1(database);
  invalidateAfterPreflight(d1, prepared.requestId);
  env.DB = d1;
  try {
    await assert.rejects(
      () => commitLiveResearch(viewer, prepared, draft()),
      (error) => error?.code === "ALREADY_IN_PROGRESS" && error?.retryable === false,
    );
    assert.equal(count(database, "turns"), 1);
    assert.deepEqual(
      database.prepare("SELECT state FROM turn_options ORDER BY position").all().map((row) => row.state),
      ["proposed", "proposed"],
    );
    assert.equal(database.prepare("SELECT version FROM journeys WHERE id = 'journey-existing'").get().version, 1);
    for (const table of ["research_runs", "usage_events", "turn_actions", "journey_edges"]) {
      assert.equal(count(database, table), 0, `${table} should remain empty`);
    }
  } finally {
    delete env.DB;
  }
});
