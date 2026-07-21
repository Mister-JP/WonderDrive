import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  STARTER_FIXTURE_PREFIX,
  STARTER_TITLE_PREFIX,
} from "../lib/starter-content-contract.ts";
import { starterContentStatements } from "../lib/starter-content.ts";

function normalizedSql(call) {
  return call.sql.replace(/\s+/g, " ").trim();
}

test("new identities receive the three real bookmarked research journeys", () => {
  const calls = [];
  const db = {
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
      };
    },
  };

  let nextId = 0;
  const originalUuid = crypto.randomUUID;
  crypto.randomUUID = () => `starter-id-${++nextId}`;
  try {
    const statements = starterContentStatements(db, "identity-new", 1_000);
    assert.equal(statements.length, calls.length);
  } finally {
    crypto.randomUUID = originalUuid;
  }

  const journeys = calls.filter((call) => normalizedSql(call).startsWith("INSERT INTO journeys"));
  const turns = calls.filter((call) => normalizedSql(call).startsWith("INSERT INTO turns"));
  const options = calls.filter((call) => normalizedSql(call).startsWith("INSERT INTO turn_options"));
  const runs = calls.filter((call) => normalizedSql(call).startsWith("INSERT INTO research_runs"));
  const bookmarks = calls.filter((call) => normalizedSql(call).startsWith("INSERT INTO bookmarks"));

  assert.equal(journeys.length, 3);
  assert.equal(turns.length, 3);
  assert.equal(options.length, 3);
  assert.ok(options.every((call) => (normalizedSql(call).match(/'proposed'/g) ?? []).length === 2), "each example stores its fallback path pair");
  assert.equal(runs.length, 3);
  assert.equal(bookmarks.length, 3);
  assert.equal(calls.length, 30, "binding-safe bulk inserts keep identity creation within a small D1 batch");
  assert.ok(calls.every((call) => call.bindings.length <= 100), "no starter insert exceeds D1's binding limit");
  assert.ok(journeys.every((call) => call.bindings[1] === "identity-new"));
  assert.ok(journeys.every((call) => String(call.bindings[3]).startsWith(STARTER_TITLE_PREFIX)));
  assert.ok(turns.every((call) => String(call.bindings[10]).startsWith(STARTER_FIXTURE_PREFIX)));
  assert.ok(bookmarks.every((call) => call.bindings[1] === "identity-new"));
  assert.deepEqual(journeys.map((call) => call.bindings[2]), [
    "Why does an Antarctic glacier appear to bleed?",
    "Can your eyes mix colors the painter never mixed?",
    "Why can the sky suddenly grow a row of breaking ocean waves?",
  ]);
  assert.deepEqual(journeys.map((call) => call.bindings[11]), [26, 27, 28]);
  assert.deepEqual(turns.map((call) => JSON.parse(call.bindings[4]).media.length), [12, 11, 12]);
  assert.ok(runs.every((call) => call.bindings[3] === "openai"));
  assert.ok(runs.every((call) => call.bindings[4] === "gpt-5.4-nano"));
});

test("the real starter snapshots persist as complete relational journey data", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE identities (id TEXT PRIMARY KEY);
    CREATE TABLE journeys (
      id TEXT PRIMARY KEY, owner_identity_id TEXT, seed TEXT, title TEXT,
      performer_id TEXT, model_id TEXT, research_preset TEXT, answer_density TEXT,
      image_preference TEXT, output_locale TEXT, current_turn_id TEXT, turn_count INTEGER,
      source_count INTEGER, last_action TEXT, status TEXT, version INTEGER,
      created_at INTEGER, updated_at INTEGER, deleted_at INTEGER
    );
    CREATE TABLE turns (
      id TEXT PRIMARY KEY, journey_id TEXT, parent_turn_id TEXT, depth INTEGER,
      question TEXT, status TEXT, answer TEXT, answer_json TEXT, transition TEXT,
      topic_label TEXT, research_summary TEXT, research_handoff_json TEXT,
      preferred_position INTEGER, fixture_key TEXT, option_set_version INTEGER,
      provider TEXT, model_id TEXT, prompt_version TEXT, performer_version TEXT,
      model_snapshot TEXT, answer_density TEXT, image_preference TEXT,
      output_locale TEXT, created_at INTEGER, ready_at INTEGER
    );
    CREATE TABLE turn_options (
      id TEXT PRIMARY KEY, turn_id TEXT, set_version INTEGER, position INTEGER,
      question TEXT, angle TEXT, state TEXT
    );
    CREATE TABLE research_runs (
      id TEXT PRIMARY KEY, journey_id TEXT, turn_id TEXT, provider TEXT, model_id TEXT,
      preset TEXT, status TEXT, input_tokens INTEGER, cached_input_tokens INTEGER,
      output_tokens INTEGER, reasoning_tokens INTEGER, total_tokens INTEGER,
      web_search_calls INTEGER, page_fetches INTEGER, latency_ms INTEGER,
      estimated_cost_microusd INTEGER, rate_effective_at TEXT, started_at INTEGER,
      completed_at INTEGER, created_at INTEGER
    );
    CREATE TABLE sources (
      id TEXT PRIMARY KEY, canonical_url TEXT UNIQUE, title TEXT, publisher TEXT,
      published_at TEXT, provider_source_id TEXT, warning TEXT, license_note TEXT,
      retrieved_at INTEGER
    );
    CREATE TABLE turn_sources (
      turn_id TEXT, source_id TEXT, relation TEXT,
      PRIMARY KEY (turn_id, source_id, relation)
    );
    CREATE TABLE research_events (
      id TEXT PRIMARY KEY, research_run_id TEXT, sequence INTEGER, kind TEXT,
      label TEXT, source_id TEXT, created_at INTEGER
    );
    CREATE TABLE bookmarks (
      id TEXT PRIMARY KEY, identity_id TEXT, journey_id TEXT, turn_id TEXT,
      created_at INTEGER, UNIQUE (identity_id, turn_id)
    );
    INSERT INTO identities (id) VALUES ('identity-new');
  `);

  const db = sqliteD1(sqlite);
  await db.batch(starterContentStatements(db, "identity-new", 1_000));

  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM journeys").get().count, 3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM bookmarks").get().count, 3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM turn_options").get().count, 6);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM sources").get().count, 81);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM turn_sources").get().count, 81);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_events").get().count, 38);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM research_runs WHERE provider = 'openai'").get().count, 3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM turns WHERE json_array_length(answer_json, '$.media') >= 11").get().count, 3);
  sqlite.close();
});

function sqliteD1(sqlite) {
  return {
    prepare(sql) {
      const state = { bindings: [] };
      return {
        bind(...bindings) {
          state.bindings = bindings;
          return this;
        },
        async run() {
          const result = sqlite.prepare(sql).run(...state.bindings);
          return { meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
}
