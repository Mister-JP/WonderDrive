import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
  BACKGROUND_RESEARCH_TIMEOUT_MS,
  cancelBackgroundResearch,
  listBackgroundResearch,
} from "../lib/background-research.ts";

const viewer = {
  identityId: "identity-background",
  mode: "chatgpt",
  displayName: "Background owner",
  journeyLimit: 25,
};

class SQLiteD1 {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    const database = this.database;
    let bindings = [];
    return {
      sql,
      bind(...values) {
        bindings = values;
        return this;
      },
      async first() {
        return database.prepare(sql).get(...bindings) ?? null;
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
     VALUES (?, 'chatgpt', 'background-subject')`,
  ).run(viewer.identityId);
  return database;
}

function prepared(requestId) {
  return {
    requestId,
    identityId: viewer.identityId,
    viewerMode: viewer.mode,
    kind: "create",
    question: "Why do fireflies flash?",
    seed: "Why do fireflies flash?",
    depth: 0,
    performerId: "sage",
    modelId: "gpt-5.6-luna",
    researchPreset: "spark",
    answerDensity: "brief",
    imagePreference: "prefer",
    outputLocale: "en",
    topicTrail: [],
    idempotencyKey: `key-${requestId}`,
    payloadHash: `hash-${requestId}`,
  };
}

function insertBackground(database, {
  requestId,
  status = "researching",
  providerResponseId = null,
  startedAt = Date.now(),
  leaseToken = "lease-background",
  leaseExpiresAt = Date.now() + 60_000,
}) {
  const request = prepared(requestId);
  database.prepare(
    `INSERT INTO research_requests
      (id, identity_id, kind, idempotency_key, payload_hash, request_json,
       execution_mode, status, provider_response_id, lease_token, lease_expires_at,
       started_at, created_at)
     VALUES (?, ?, 'create', ?, ?, ?, 'background', ?, ?, ?, ?, ?, ?)`,
  ).run(
    requestId,
    viewer.identityId,
    request.idempotencyKey,
    request.payloadHash,
    JSON.stringify(request),
    status,
    providerResponseId,
    leaseToken,
    leaseExpiresAt,
    startedAt,
    startedAt,
  );
}

test("background research expires to a retryable terminal status after ten minutes", async () => {
  const database = migratedDatabase();
  const requestId = "request-expired-background";
  insertBackground(database, {
    requestId,
    startedAt: Date.now() - BACKGROUND_RESEARCH_TIMEOUT_MS - 1,
  });
  env.DB = new SQLiteD1(database);
  try {
    const activities = await listBackgroundResearch(viewer, { reconcile: false });
    const activity = activities.find(({ id }) => id === requestId);
    assert.equal(activity.status, "failed");
    assert.match(activity.error, /10-minute limit/);
    assert.deepEqual(
      { ...database.prepare(
        "SELECT status, error_code, lease_token, lease_expires_at FROM research_requests WHERE id = ?",
      ).get(requestId) },
      { status: "failed", error_code: "PROVIDER_TIMEOUT", lease_token: null, lease_expires_at: null },
    );
  } finally {
    delete env.DB;
  }
});

test("learner cancellation is idempotent and fences stale finalizers", async () => {
  const database = migratedDatabase();
  const requestId = "request-cancelled-background";
  insertBackground(database, { requestId });
  env.DB = new SQLiteD1(database);
  try {
    const first = await cancelBackgroundResearch(viewer, requestId);
    const second = await cancelBackgroundResearch(viewer, requestId);
    assert.equal(first.status, "failed");
    assert.equal(second.status, "failed");
    assert.equal(first.error, "Research was stopped by you.");
    assert.deepEqual(
      { ...database.prepare(
        "SELECT status, error_code, lease_token, lease_expires_at FROM research_requests WHERE id = ?",
      ).get(requestId) },
      { status: "failed", error_code: "CANCELLED", lease_token: null, lease_expires_at: null },
    );
  } finally {
    delete env.DB;
  }
});

test("background activity includes an in-progress child turn and its parent journey", async () => {
  const database = migratedDatabase();
  const requestId = "request-background-child";
  const request = {
    ...prepared(requestId),
    kind: "advance",
    question: "How does bioluminescence chemistry work?",
    depth: 1,
    journeyId: "journey-parent",
    fromTurnId: "turn-parent",
    selectedOptionId: "option-child",
    action: "choose",
    expectedVersion: 1,
  };
  database.prepare(
    `INSERT INTO research_requests
      (id, identity_id, kind, idempotency_key, payload_hash, request_json,
       execution_mode, status, started_at, created_at)
     VALUES (?, ?, 'advance', ?, ?, ?, 'background', 'researching', ?, ?)`,
  ).run(
    requestId,
    viewer.identityId,
    request.idempotencyKey,
    request.payloadHash,
    JSON.stringify(request),
    Date.now(),
    Date.now(),
  );
  env.DB = new SQLiteD1(database);
  try {
    const activities = await listBackgroundResearch(viewer, { reconcile: false });
    const activity = activities.find(({ id }) => id === requestId);
    assert.equal(activity.status, "researching");
    assert.equal(activity.question, request.question);
    assert.equal(activity.journeyId, request.journeyId);
  } finally {
    delete env.DB;
  }
});

test("completed provider work that fails finalization becomes failed instead of staying researching", async (context) => {
  const database = migratedDatabase();
  const requestId = "request-invalid-background";
  insertBackground(database, {
    requestId,
    providerResponseId: "resp_invalid_background",
    leaseToken: null,
    leaseExpiresAt: null,
  });
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  globalThis.fetch = async () => Response.json({
    id: "resp_invalid_background",
    status: "completed",
    output: [],
    usage: {},
  });
  env.OPENAI_API_KEY = "test-key";
  env.DB = new SQLiteD1(database);
  try {
    const activities = await listBackgroundResearch(viewer);
    const activity = activities.find(({ id }) => id === requestId);
    assert.equal(activity.status, "failed");
    assert.match(activity.error, /could not be formatted safely/);
    assert.equal(
      database.prepare("SELECT error_code FROM research_requests WHERE id = ?").get(requestId).error_code,
      "SCHEMA_INVALID",
    );
  } finally {
    delete env.OPENAI_API_KEY;
    delete env.DB;
  }
});
