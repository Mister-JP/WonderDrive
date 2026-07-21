import { MODELS } from "./catalog";
import type { ModelId, Viewer } from "./contracts";

export const ROLLING_USAGE_WINDOW_MS = 24 * 60 * 60 * 1_000;

export type CurrentUserPolicy = {
  mode: Viewer["mode"];
  funding: "application";
  allowedModelIds: readonly ModelId[];
  liveResearchLimit: number;
  identitySpendLimitUsd: number;
  journeyLimit: number;
};

const CURRENT_LIVE_MODEL_IDS = Object.freeze(
  MODELS.filter((model) => model.mode === "live").map((model) => model.id),
);

export const CURRENT_USER_POLICIES: Readonly<Record<Viewer["mode"], CurrentUserPolicy>> =
  Object.freeze({
    guest: Object.freeze({
      mode: "guest",
      funding: "application",
      allowedModelIds: CURRENT_LIVE_MODEL_IDS,
      liveResearchLimit: 25,
      identitySpendLimitUsd: 3,
      journeyLimit: 50,
    }),
    chatgpt: Object.freeze({
      mode: "chatgpt",
      funding: "application",
      allowedModelIds: CURRENT_LIVE_MODEL_IDS,
      liveResearchLimit: 100,
      identitySpendLimitUsd: 15,
      journeyLimit: 25,
    }),
  });

export function currentUserPolicy(mode: Viewer["mode"]): CurrentUserPolicy {
  return CURRENT_USER_POLICIES[mode];
}

export function isModelAllowed(mode: Viewer["mode"], modelId: ModelId) {
  return currentUserPolicy(mode).allowedModelIds.includes(modelId);
}

export function liveResearchLimit(mode: Viewer["mode"]) {
  return currentUserPolicy(mode).liveResearchLimit;
}

export function identitySpendLimitUsd(mode: Viewer["mode"]) {
  return currentUserPolicy(mode).identitySpendLimitUsd;
}

export function journeyLimit(mode: Viewer["mode"]) {
  return currentUserPolicy(mode).journeyLimit;
}
