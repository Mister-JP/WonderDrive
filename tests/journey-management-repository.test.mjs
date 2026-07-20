import assert from "node:assert/strict";
import test from "node:test";
import { env } from "cloudflare:workers";
import { updateJourneyManagement } from "../lib/journey-management-repository.ts";

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
    hidden: 1,
    current_turn_id: "turn-current",
    turn_count: 2,
    source_count: 3,
    status: "active",
    version: 7,
    updated_at: 900,
    open_branch_count: 2,
    ...changes,
  };
}

function createManagementD1({ owned = true, changes = 1 } = {}) {
  const calls = [];
  let row = journeyRow();
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
          return owned ? { ...row } : null;
        },
        async all() {
          call.methods.push("all");
          return { results: [] };
        },
        async run() {
          call.methods.push("run");
          if (changes > 0) {
            row = {
              ...row,
              title: call.bindings[0],
              pinned: call.bindings[1],
              hidden: call.bindings[2],
              version: row.version + 1,
              updated_at: call.bindings[3],
            };
          }
          return { meta: { changes } };
        },
      };
    },
  };
}

function normalizedSql(call) {
  return call.sql.replace(/\s+/g, " ").trim();
}

function isUpdate(call) {
  return normalizedSql(call).startsWith("UPDATE journeys SET");
}

test("journey management preserves validation before D1 access", async () => {
  const cases = [
    [null, "A valid request body is required."],
    [{ title: "   " }, "Keep the journey label between 1 and 100 characters."],
    [{ title: "x".repeat(101) }, "Keep the journey label between 1 and 100 characters."],
    [{ title: 42, pinned: "yes", hidden: null, ignored: true }, "Choose a journey setting to update."],
  ];

  for (const [value, message] of cases) {
    const db = createManagementD1();
    env.DB = db;
    await assert.rejects(
      () => updateJourneyManagement(viewer, "journey-alpha", value),
      (error) => error?.code === "BAD_REQUEST"
        && error?.status === 400
        && error?.retryable === false
        && error?.message === message,
    );
    assert.equal(db.calls.length, 0);
  }
});

test("journey management preserves normalization, omitted values, SQL, optimistic versioning, and reread", async () => {
  const db = createManagementD1();
  env.DB = db;
  const originalNow = Date.now;
  Date.now = () => 1234;
  let result;
  try {
    result = await updateJourneyManagement(viewer, "journey-alpha", {
      title: "  New \n journey   title  ",
      pinned: false,
    });
  } finally {
    Date.now = originalNow;
  }

  const update = db.calls.find(isUpdate);
  assert.ok(update);
  assert.match(
    normalizedSql(update),
    /^UPDATE journeys SET title = \?, pinned = \?, hidden = \?, version = version \+ 1, updated_at = \? WHERE id = \? AND owner_identity_id = \? AND version = \? AND deleted_at IS NULL$/,
  );
  assert.deepEqual(update.bindings, [
    "New journey title",
    0,
    1,
    1234,
    "journey-alpha",
    viewer.identityId,
    7,
  ]);
  assert.deepEqual(update.methods, ["run"]);
  assert.equal(result.title, "New journey title");
  assert.equal(result.pinned, false);
  assert.equal(result.hidden, true);
  assert.equal(result.version, 8);
  assert.equal(result.updatedAt, 1234);

  const ownedReads = db.calls.filter((call) => normalizedSql(call).includes("FROM journeys") && call.methods.includes("first"));
  assert.equal(ownedReads.length, 2);
  assert.ok(ownedReads.every((call) => normalizedSql(call).includes("id = ? AND owner_identity_id = ? AND deleted_at IS NULL LIMIT 1")));
  assert.ok(ownedReads.every((call) => JSON.stringify(call.bindings) === JSON.stringify(["journey-alpha", viewer.identityId])));
});

test("journey management preserves indistinguishable authorization failure before mutation", async () => {
  const db = createManagementD1({ owned: false });
  env.DB = db;

  await assert.rejects(
    () => updateJourneyManagement(viewer, "journey-other", { pinned: true }),
    (error) => error?.code === "NOT_FOUND"
      && error?.status === 404
      && error?.retryable === false
      && error?.message === "That saved journey was not found.",
  );
  assert.equal(db.calls.filter(isUpdate).length, 0);
  assert.deepEqual(db.calls[0].bindings, ["journey-other", viewer.identityId]);
});

test("journey management preserves retryable version conflict without a final reread", async () => {
  const db = createManagementD1({ changes: 0 });
  env.DB = db;

  await assert.rejects(
    () => updateJourneyManagement(viewer, "journey-alpha", { hidden: false }),
    (error) => error?.code === "VERSION_CONFLICT"
      && error?.status === 409
      && error?.retryable === true
      && error?.message === "The journey changed before it could be updated.",
  );
  const update = db.calls.find(isUpdate);
  assert.ok(update);
  assert.deepEqual(update.bindings.slice(0, 3), ["Firefly trail", 1, 0]);
  const ownedReads = db.calls.filter((call) => normalizedSql(call).includes("FROM journeys") && call.methods.includes("first"));
  assert.equal(ownedReads.length, 1);
});
