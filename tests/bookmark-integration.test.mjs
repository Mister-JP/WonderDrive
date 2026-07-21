import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { env } from "cloudflare:workers";
import { assertMutationOrigin, failure } from "../lib/api.ts";
import { RepositoryError } from "../lib/errors.ts";
import { deleteJourney } from "../lib/repository.ts";
import { guestDataUpgradeStatements } from "../lib/viewer.ts";

function normalizedSql(call) {
  return call.sql.replace(/\s+/g, " ").trim();
}

test("bookmark schema and generated migration preserve constraints and ordering metadata", async () => {
  const [schema, migration, journal] = await Promise.all([
    readFile(new URL("../db/schema.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0012_polite_captain_britain.sql", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  ]);
  assert.match(schema, /bookmarks_identity_turn_unique/);
  assert.match(schema, /bookmarks_identity_created_idx/);
  assert.match(migration, /CREATE TABLE `bookmarks`/);
  assert.match(migration, /FOREIGN KEY \(`identity_id`\) REFERENCES `identities`\(`id`\)/);
  assert.match(migration, /CREATE UNIQUE INDEX `bookmarks_identity_turn_unique`/);
  assert.match(migration, /CREATE INDEX `bookmarks_identity_created_idx`/);
  const entries = JSON.parse(journal).entries;
  const bookmarkEntry = entries.find(({ tag }) => tag === "0012_polite_captain_britain");
  assert.equal(bookmarkEntry?.idx, 12);
  assert.deepEqual(entries.map(({ idx }) => idx), entries.map((_, index) => index));
});

test("bookmark mutations use the standard same-origin failure envelope", async () => {
  assert.throws(
    () => assertMutationOrigin(new Request("https://curiosity.example/api/bookmarks", {
      method: "POST",
      headers: { origin: "https://attacker.example", "sec-fetch-site": "cross-site" },
    })),
    (error) => error?.code === "FORBIDDEN" && error?.status === 403,
  );
  const response = failure(new RepositoryError("NOT_FOUND", "That saved question was not found.", 404));
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: "NOT_FOUND",
      message: "That saved question was not found.",
      retryable: false,
    },
  });
});

test("guest upgrade transfers user content without duplicating starter examples", () => {
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
  const originalUuid = crypto.randomUUID;
  crypto.randomUUID = () => "upgrade-id";
  try {
    const statements = guestDataUpgradeStatements(
      db,
      "identity-guest",
      "identity-account",
      "upgrade-key",
      2,
      500,
    );
    assert.equal(statements.length, 6);
  } finally {
    crypto.randomUUID = originalUuid;
  }
  assert.match(normalizedSql(calls[0]), /^DELETE FROM bookmarks .*EXISTS \( SELECT 1 FROM bookmarks account_bookmark/);
  assert.match(normalizedSql(calls[1]), /^UPDATE bookmarks SET identity_id = \?/);
  assert.match(normalizedSql(calls[2]), /^UPDATE journeys SET owner_identity_id = \?/);
  assert.equal(normalizedSql(calls[3]), "DELETE FROM bookmarks WHERE identity_id = ?");
  assert.match(normalizedSql(calls[5]), /^INSERT INTO identity_upgrades/);
  assert.deepEqual(calls[1].bindings, ["identity-account", "identity-guest", "identity-guest", "starter:v1:%"]);
  assert.deepEqual(calls[2].bindings, ["identity-account", 500, "identity-guest", "starter:v1:%"]);
  assert.ok(calls.slice(0, 3).every((call) => normalizedSql(call).includes("fixture_key LIKE ?")));
});

test("authorized journey deletion removes its bookmarks in the same D1 batch", async () => {
  const calls = [];
  env.DB = {
    prepare(sql) {
      const call = { sql, bindings: [] };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async run() {
          return { meta: { changes: 1 } };
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
  const result = await deleteJourney({
    identityId: "identity-owner",
    mode: "chatgpt",
    displayName: "Owner",
    journeyLimit: 20,
  }, "journey-alpha");
  assert.deepEqual(result, { id: "journey-alpha" });
  assert.equal(calls.length, 2);
  assert.match(normalizedSql(calls[0]), /^UPDATE journeys SET status = 'deleted'/);
  assert.match(normalizedSql(calls[1]), /^DELETE FROM bookmarks WHERE identity_id = \? AND journey_id = \?/);
  assert.deepEqual(calls[1].bindings.slice(0, 2), ["identity-owner", "journey-alpha"]);
});

test("bookmark routes are thin typed adapters over query, mutation, and readJson", async () => {
  const [collection, removal, legacyImport] = await Promise.all([
    readFile(new URL("../app/api/bookmarks/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bookmarks/[turnId]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/bookmarks/import/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(collection, /return query\(listBookmarks\)/);
  assert.match(collection, /return mutation\(/);
  assert.match(collection, /readJson<AddBookmarkRequest>/);
  assert.match(removal, /return mutation\(/);
  assert.match(legacyImport, /return mutation\(/);
  assert.match(legacyImport, /readJson<ImportBookmarksRequest>/);
});

test("the client hydrates bookmarks from the server and uses localStorage only for legacy import", async () => {
  const source = await readFile(new URL("../app/curiositypedia-experience.tsx", import.meta.url), "utf8");
  assert.match(source, /api<Bookmark\[]>\("\/api\/bookmarks"\)/);
  assert.match(source, /setBookmarks\(bookmarkPayload\.data\)/);
  assert.match(source, /migrateLegacyBookmarks\(/);
  assert.doesNotMatch(source, /setItem\("curiositypedia:bookmarked-turns"/);
  assert.doesNotMatch(source, /Record<string, number>/);
});
