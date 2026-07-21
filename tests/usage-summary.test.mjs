import assert from "node:assert/strict";
import test from "node:test";
import { MODELS } from "../lib/catalog.ts";
import { usageSummaryTestHooks } from "../lib/usage-summary.ts";
import {
  CURRENT_USER_POLICIES,
  currentUserPolicy,
  identitySpendLimitUsd,
  isModelAllowed,
  journeyLimit,
  liveResearchLimit,
} from "../lib/usage-policy.ts";

const HOUR = 60 * 60 * 1_000;

test("publishes the expanded guest and signed-in live research limits", () => {
  assert.equal(liveResearchLimit("guest"), 25);
  assert.equal(liveResearchLimit("chatgpt"), 100);
});

test("models the current policy for 50 guest and ChatGPT users without a paid-user tier", () => {
  const now = Date.UTC(2026, 6, 18, 12, 0, 0);
  const liveModelIds = MODELS
    .filter((model) => model.mode === "live")
    .map((model) => model.id);
  const users = Array.from({ length: 50 }, (_, index) => ({
    identityId: `synthetic-user-${index + 1}`,
    mode: index < 25 ? "guest" : "chatgpt",
  }));

  assert.deepEqual(Object.keys(CURRENT_USER_POLICIES).sort(), ["chatgpt", "guest"]);
  assert.equal(new Set(users.map((user) => user.identityId)).size, 50);

  for (const user of users) {
    const policy = currentUserPolicy(user.mode);
    const guest = user.mode === "guest";
    assert.equal(policy.funding, "application");
    assert.deepEqual(policy.allowedModelIds, liveModelIds);
    assert.ok(liveModelIds.every((modelId) => isModelAllowed(user.mode, modelId)));
    assert.equal(policy.liveResearchLimit, guest ? 25 : 100);
    assert.equal(policy.identitySpendLimitUsd, guest ? 3 : 15);
    assert.equal(policy.journeyLimit, guest ? 50 : 25);
    assert.equal(liveResearchLimit(user.mode), policy.liveResearchLimit);
    assert.equal(identitySpendLimitUsd(user.mode), policy.identitySpendLimitUsd);
    assert.equal(journeyLimit(user.mode), policy.journeyLimit);

    const summary = usageSummaryTestHooks.mapUsageSummary({
      viewer: {
        identityId: user.identityId,
        mode: user.mode,
        displayName: user.mode === "guest" ? "Guest explorer" : "Explorer",
        journeyLimit: policy.journeyLimit,
      },
      now,
      researchCreatedAt: Array.from(
        { length: policy.liveResearchLimit },
        (_, index) => now - index * 1_000,
      ),
      spentMicrousd: policy.identitySpendLimitUsd * 1_000_000,
      oldestPaidAt: now,
      savedJourneys: policy.journeyLimit,
    });
    assert.equal(summary.liveResearch.remaining, 0);
    assert.equal(summary.spend.remainingUsd, 0);
    assert.equal(summary.library.remaining, 0);
  }
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
    heldMicrousd: 100_000,
    accountedMicrousd: 350_000,
    oldestPaidAt: now - 12 * HOUR,
    savedJourneys: 4,
  });

  assert.equal(summary.liveResearch.used, 25);
  assert.equal(summary.liveResearch.remaining, 0);
  assert.equal(summary.liveResearch.nextSlotAt, createdAt[0] + 24 * HOUR);
  assert.equal(summary.liveResearch.releasesAt.length, 25);
  assert.equal(summary.spend.usedUsd, 0.25);
  assert.equal(summary.spend.heldUsd, 0.1);
  assert.equal(summary.spend.accountedUsd, 0.35);
  assert.equal(summary.spend.remainingUsd, 2.65);
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
