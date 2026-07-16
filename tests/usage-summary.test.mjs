import assert from "node:assert/strict";
import test from "node:test";
import { usageSummaryTestHooks } from "../lib/usage-summary.ts";
import { liveResearchLimit } from "../lib/usage-policy.ts";

const HOUR = 60 * 60 * 1_000;

test("publishes the expanded guest and signed-in live research limits", () => {
  assert.equal(liveResearchLimit("guest"), 25);
  assert.equal(liveResearchLimit("chatgpt"), 100);
});

test("maps rolling guest usage to exact slot-return times", () => {
  const now = Date.UTC(2026, 6, 15, 14, 0, 0);
  const createdAt = Array.from({ length: 25 }, (_, index) => now - (23 - index * 0.5) * HOUR);
  const summary = usageSummaryTestHooks.mapUsageSummary({
    viewer: {
      identityId: "guest-1",
      mode: "guest",
      displayName: "Guest explorer",
      journeyLimit: 50,
      guestExpiresAt: now + 10 * 24 * HOUR,
    },
    now,
    researchCreatedAt: createdAt,
    spentMicrousd: 250_000,
    oldestPaidAt: now - 12 * HOUR,
    savedJourneys: 4,
  });

  assert.equal(summary.liveResearch.used, 25);
  assert.equal(summary.liveResearch.remaining, 0);
  assert.equal(summary.liveResearch.nextSlotAt, createdAt[0] + 24 * HOUR);
  assert.equal(summary.liveResearch.releasesAt.length, 25);
  assert.equal(summary.spend.usedUsd, 0.25);
  assert.equal(summary.spend.nextReleaseAt, now + 12 * HOUR);
  assert.deepEqual(summary.library, { used: 4, limit: 50, remaining: 46 });
});

test("keeps next-slot timing empty while signed-in runs remain available", () => {
  const now = Date.UTC(2026, 6, 15, 14, 0, 0);
  const summary = usageSummaryTestHooks.mapUsageSummary({
    viewer: {
      identityId: "account-1",
      mode: "chatgpt",
      displayName: "Explorer",
      journeyLimit: 25,
    },
    now,
    researchCreatedAt: [now - HOUR, now - 2 * HOUR],
    spentMicrousd: 0,
    oldestPaidAt: null,
    savedJourneys: 3,
  });

  assert.equal(summary.liveResearch.limit, 100);
  assert.equal(summary.liveResearch.remaining, 98);
  assert.equal(summary.liveResearch.nextSlotAt, null);
  assert.equal(summary.guestSessionExpiresAt, null);
});
