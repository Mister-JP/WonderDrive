import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_BOOKMARKS_STORAGE_KEY,
  migrateLegacyBookmarks,
  parseLegacyBookmarks,
} from "../app/bookmarks-client.ts";

function storageWith(value) {
  const values = new Map([[LEGACY_BOOKMARKS_STORAGE_KEY, value]]);
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    removeItem(key) { values.delete(key); },
  };
}

test("legacy parsing keeps only valid journey-turn timestamp entries", () => {
  assert.deepEqual(parseLegacyBookmarks(JSON.stringify({
    "journey-alpha::turn-ready": 123,
    "short::turn-ready": 124,
    "journey-alpha::short": 125,
    "journey-alpha::turn-ready::extra": 126,
    "journey-beta::turn-other": "yesterday",
    "journey-future::turn-future": Date.now() + 10 * 60 * 1000,
  })), [{ journeyId: "journey-alpha", turnId: "turn-ready", savedAt: 123 }]);
  assert.deepEqual(parseLegacyBookmarks("not-json"), []);
  assert.deepEqual(parseLegacyBookmarks("[]"), []);
});

test("legacy migration removes storage only after a confirmed server import", async () => {
  const successful = storageWith(JSON.stringify({ "journey-alpha::turn-ready": 123 }));
  const durable = [{ id: "bookmark-one" }];
  const result = await migrateLegacyBookmarks(successful, async (entries) => {
    assert.deepEqual(entries, [{ journeyId: "journey-alpha", turnId: "turn-ready", savedAt: 123 }]);
    return durable;
  });
  assert.equal(result, durable);
  assert.equal(successful.values.has(LEGACY_BOOKMARKS_STORAGE_KEY), false);

  const failed = storageWith(JSON.stringify({ "journey-alpha::turn-ready": 123 }));
  await assert.rejects(
    () => migrateLegacyBookmarks(failed, async () => { throw new Error("offline"); }),
    /offline/,
  );
  assert.equal(failed.values.has(LEGACY_BOOKMARKS_STORAGE_KEY), true);
});

test("malformed legacy content is still cleared only after an empty import is confirmed", async () => {
  const storage = storageWith("not-json");
  let confirmed = false;
  await migrateLegacyBookmarks(storage, async (entries) => {
    assert.deepEqual(entries, []);
    confirmed = true;
    return [];
  });
  assert.equal(confirmed, true);
  assert.equal(storage.values.has(LEGACY_BOOKMARKS_STORAGE_KEY), false);
});
