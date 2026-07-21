import assert from "node:assert/strict";
import test from "node:test";
import {
  STARTER_FIXTURE_PREFIX,
  STARTER_TITLE_PREFIX,
} from "../lib/starter-content-contract.ts";
import { starterContentStatements } from "../lib/starter-content.ts";

function normalizedSql(call) {
  return call.sql.replace(/\s+/g, " ").trim();
}

test("new identities receive three complete, bookmarked starter journeys", () => {
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
  assert.equal(options.length, 6, "each example offers exactly two next paths");
  assert.equal(runs.length, 3);
  assert.equal(bookmarks.length, 3);
  assert.ok(journeys.every((call) => call.bindings[1] === "identity-new"));
  assert.ok(journeys.every((call) => String(call.bindings[3]).startsWith(STARTER_TITLE_PREFIX)));
  assert.ok(turns.every((call) => String(call.bindings[10]).startsWith(STARTER_FIXTURE_PREFIX)));
  assert.ok(bookmarks.every((call) => call.bindings[1] === "identity-new"));
});
