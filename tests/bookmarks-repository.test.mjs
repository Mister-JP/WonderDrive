import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import {
  addBookmark,
  importBookmarks,
  listBookmarks,
  removeBookmark,
} from "../lib/bookmarks-repository.ts";

const viewer = {
  identityId: "identity-owner",
  mode: "chatgpt",
  displayName: "Owner",
  journeyLimit: 20,
};

function bookmarkRow(changes = {}) {
  return {
    id: "bookmark-one",
    journey_id: "journey-alpha",
    turn_id: "turn-ready",
    created_at: 200,
    question: "Why do fireflies glow?",
    topic_label: "Bioluminescence",
    journey_seed: "Why is living light possible?",
    journey_title: "Firefly trail",
    performer_id: "sage",
    source_count: 2,
    ...changes,
  };
}

function normalizedSql(call) {
  return call.sql.replace(/\s+/g, " ").trim();
}

function createBookmarkD1({ rows = [], ownedJourneys = ["journey-alpha"], readyTurns = ["turn-ready"] } = {}) {
  const calls = [];
  const stored = rows.map((row) => ({ ...row }));
  const execute = async (call) => {
    const sql = normalizedSql(call);
    if (sql.startsWith("INSERT OR IGNORE INTO bookmarks")) {
      const [id, identityId, createdAt, journeyId, ownerIdentityId, turnId] = call.bindings;
      const allowed = identityId === viewer.identityId
        && ownerIdentityId === viewer.identityId
        && ownedJourneys.includes(journeyId)
        && readyTurns.includes(turnId);
      if (!allowed || stored.some((row) => row.turn_id === turnId && row.identity_id === identityId)) {
        return { meta: { changes: 0 } };
      }
      stored.push(bookmarkRow({
        id,
        identity_id: identityId,
        journey_id: journeyId,
        turn_id: turnId,
        created_at: createdAt,
        question: `Question ${turnId}`,
      }));
      return { meta: { changes: 1 } };
    }
    if (sql.startsWith("DELETE FROM bookmarks WHERE identity_id")) {
      const [identityId, turnId] = call.bindings;
      const index = stored.findIndex((row) => row.identity_id === identityId && row.turn_id === turnId);
      if (index < 0) return { meta: { changes: 0 } };
      stored.splice(index, 1);
      return { meta: { changes: 1 } };
    }
    return { meta: { changes: 0 } };
  };
  return {
    calls,
    stored,
    prepare(sql) {
      const call = { sql, bindings: [], method: null };
      calls.push(call);
      return {
        bind(...bindings) {
          call.bindings = bindings;
          return this;
        },
        async run() {
          call.method = "run";
          return execute(call);
        },
        async all() {
          call.method = "all";
          return {
            results: stored
              .filter((row) => row.identity_id === call.bindings[1])
              .filter((row) => ownedJourneys.includes(row.journey_id) && readyTurns.includes(row.turn_id))
              .sort((left, right) => right.created_at - left.created_at),
          };
        },
        async first() {
          call.method = "first";
          const turnId = call.bindings[2];
          return stored.find((row) => (
            row.identity_id === call.bindings[1]
            && row.turn_id === turnId
            && ownedJourneys.includes(row.journey_id)
            && readyTurns.includes(row.turn_id)
          )) ?? null;
        },
      };
    },
    async batch(statements) {
      return Promise.all(statements.map((statement) => statement.run()));
    },
  };
}

test("bookmark listing is identity-scoped, newest-first, joined, and omits internal identities", async () => {
  const db = createBookmarkD1({
    rows: [
      bookmarkRow({ id: "old", identity_id: viewer.identityId, created_at: 100 }),
      bookmarkRow({ id: "new", identity_id: viewer.identityId, turn_id: "turn-second", created_at: 300 }),
      bookmarkRow({ id: "other", identity_id: "identity-other", created_at: 400 }),
    ],
    readyTurns: ["turn-ready", "turn-second"],
  });
  env.DB = db;

  const result = await listBookmarks(viewer);
  assert.deepEqual(result.map((bookmark) => bookmark.id), ["new", "old"]);
  assert.deepEqual(result[0], {
    id: "new",
    journeyId: "journey-alpha",
    turnId: "turn-second",
    bookmarkedAt: 300,
    question: "Why do fireflies glow?",
    topicLabel: "Bioluminescence",
    journeySeed: "Why is living light possible?",
    journeyTitle: "Firefly trail",
    performerId: "sage",
    sourceCount: 2,
  });
  assert.equal("identityId" in result[0], false);
  const sql = normalizedSql(db.calls[0]);
  assert.match(sql, /JOIN journeys j ON j\.id = b\.journey_id AND j\.owner_identity_id = \? AND j\.deleted_at IS NULL/);
  assert.match(sql, /JOIN turns t ON t\.id = b\.turn_id AND t\.journey_id = j\.id AND t\.status = 'ready'/);
  assert.match(sql, /COUNT\(DISTINCT ts\.source_id\)/);
  assert.match(sql, /ORDER BY b\.created_at DESC, b\.id DESC$/);
  assert.deepEqual(db.calls[0].bindings, [viewer.identityId, viewer.identityId]);
});

test("add is authorized and idempotent while another viewer's turn is authorization-safe", async () => {
  const db = createBookmarkD1();
  env.DB = db;
  const originalUuid = crypto.randomUUID;
  const originalNow = Date.now;
  crypto.randomUUID = () => "bookmark-generated";
  Date.now = () => 500;
  try {
    const first = await addBookmark(viewer, { journeyId: "journey-alpha", turnId: "turn-ready" });
    const duplicate = await addBookmark(viewer, { journeyId: "journey-alpha", turnId: "turn-ready" });
    assert.equal(first.id, "bookmark-generated");
    assert.equal(duplicate.id, "bookmark-generated");
    assert.equal(db.stored.length, 1);
  } finally {
    crypto.randomUUID = originalUuid;
    Date.now = originalNow;
  }

  const forbiddenDb = createBookmarkD1({ ownedJourneys: [] });
  env.DB = forbiddenDb;
  await assert.rejects(
    () => addBookmark(viewer, { journeyId: "journey-other", turnId: "turn-other" }),
    (error) => error?.code === "NOT_FOUND" && error?.status === 404
      && error?.message === "That saved question was not found.",
  );
  assert.equal(forbiddenDb.stored.length, 0);
});

test("remove is identity-bound and idempotent", async () => {
  const db = createBookmarkD1({
    rows: [bookmarkRow({ identity_id: viewer.identityId })],
  });
  env.DB = db;
  assert.deepEqual(await removeBookmark(viewer, "turn-ready"), { turnId: "turn-ready" });
  assert.deepEqual(await removeBookmark(viewer, "turn-ready"), { turnId: "turn-ready" });
  assert.equal(db.stored.length, 0);
  assert.deepEqual(await listBookmarks(viewer), [], "a fresh server hydration stays removed");
  assert.ok(db.calls.every((call) => call.bindings[0] === viewer.identityId));
});

test("deleted journeys and non-ready turns are excluded", async () => {
  const db = createBookmarkD1({
    rows: [bookmarkRow({ identity_id: viewer.identityId })],
    ownedJourneys: [],
  });
  env.DB = db;
  assert.deepEqual(await listBookmarks(viewer), []);

  const pendingDb = createBookmarkD1({ readyTurns: [] });
  env.DB = pendingDb;
  await assert.rejects(
    () => addBookmark(viewer, { journeyId: "journey-alpha", turnId: "turn-ready" }),
    (error) => error?.code === "NOT_FOUND" && error?.status === 404,
  );
});

test("bulk import validates, ignores unauthorized entries, and remains idempotent", async () => {
  const db = createBookmarkD1({ readyTurns: ["turn-ready", "turn-other"] });
  env.DB = db;
  const entries = [
    { journeyId: "journey-alpha", turnId: "turn-ready", savedAt: 100 },
    { journeyId: "journey-alpha", turnId: "turn-ready", savedAt: 200 },
    { journeyId: "journey-other", turnId: "turn-other", savedAt: 300 },
  ];
  const first = await importBookmarks(viewer, { entries });
  const second = await importBookmarks(viewer, { entries });
  assert.equal(first.imported, 1);
  assert.equal(second.imported, 0);
  assert.equal(first.bookmarks.length, 1);
  assert.equal(first.bookmarks[0].bookmarkedAt, 100);

  await assert.rejects(
    () => importBookmarks(viewer, { entries: [{ journeyId: "short", turnId: "turn-ready", savedAt: 1 }] }),
    (error) => error?.code === "BAD_REQUEST" && error?.status === 400,
  );
  await assert.rejects(
    () => importBookmarks(viewer, { entries: "not-an-array" }),
    (error) => error?.code === "BAD_REQUEST" && error?.status === 400,
  );
});
