import { getD1 } from "../db";
import { MODELS } from "./catalog";
import type { ModelId, Viewer } from "./contracts";
import { RepositoryError } from "./errors";
import { assertOpenAIAvailable } from "./openai";
import type { ProviderAuth } from "./provider-auth";
import {
  identitySpendLimitUsd,
  isModelAllowed,
  ROLLING_USAGE_WINDOW_MS,
} from "./usage-policy";

export type ProviderCostOperation =
  | "live_research"
  | "image_note_repair"
  | "citation_repair"
  | "citation_recovery"
  | "starter_generation"
  | "question_redraw";

type ReservationContext = {
  callKey: string;
  identityId: string;
  viewerMode: Viewer["mode"];
  modelId: ModelId;
  operation: ProviderCostOperation;
  requestBody: object;
  researchRequestId?: string;
  journeyId?: string;
  turnId?: string;
  unavailableMessage?: string;
  providerAuth?: ProviderAuth;
};

export type ProviderCostReservation = {
  id: string | null;
  reservedMicrousd: number;
};

type CostEnvelope = {
  inputTokenUpperBound: number;
  maxOutputTokens: number;
  maxToolCalls: number;
  reservedMicrousd: number;
};

export async function reserveProviderCost(
  input: ReservationContext,
): Promise<ProviderCostReservation> {
  assertOpenAIAvailable(input.unavailableMessage, input.providerAuth?.apiKey);
  if (!isModelAllowed(input.viewerMode, input.modelId)) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported live research model.", 400);
  }
  const model = MODELS.find((candidate) => candidate.id === input.modelId);
  if (!model) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported live research model.", 400);
  }
  const envelope = costEnvelope(input.requestBody, input.modelId);
  if (input.providerAuth?.funding === "user") {
    return { id: null, reservedMicrousd: 0 };
  }
  const now = Date.now();
  const windowStart = now - ROLLING_USAGE_WINDOW_MS;
  const identityLimitMicrousd = Math.round(identitySpendLimitUsd(input.viewerMode) * 1_000_000);
  const projectLimitMicrousd = Math.round(projectSpendLimitUsd() * 1_000_000);
  const id = crypto.randomUUID();
  const result = await getD1()
    .prepare(
      `INSERT INTO provider_cost_reservations
        (id, call_key, identity_id, research_request_id, journey_id, turn_id, provider,
         model_id, operation, status, reserved_microusd, settled_microusd,
         price_effective_at, envelope_json, window_started_at, created_at)
       SELECT ?, ?, ?, ?, ?, ?, 'openai', ?, ?, 'reserved', ?, NULL, ?, ?, ?, ?
       WHERE
         COALESCE((
           SELECT SUM(CASE
             WHEN status = 'settled' THEN COALESCE(settled_microusd, reserved_microusd)
             WHEN status IN ('reserved', 'uncertain') THEN reserved_microusd
             ELSE 0 END)
           FROM provider_cost_reservations
           WHERE window_started_at >= ?
         ), 0) + ? <= ?
         AND COALESCE((
           SELECT SUM(CASE
             WHEN status = 'settled' THEN COALESCE(settled_microusd, reserved_microusd)
             WHEN status IN ('reserved', 'uncertain') THEN reserved_microusd
             ELSE 0 END)
           FROM provider_cost_reservations
           WHERE identity_id = ? AND window_started_at >= ?
         ), 0) + ? <= ?`,
    )
    .bind(
      id,
      input.callKey.slice(0, 240),
      input.identityId,
      input.researchRequestId ?? null,
      input.journeyId ?? null,
      input.turnId ?? null,
      input.modelId,
      input.operation,
      envelope.reservedMicrousd,
      model.priceEffectiveAt,
      JSON.stringify(envelope),
      now,
      now,
      windowStart,
      envelope.reservedMicrousd,
      projectLimitMicrousd,
      input.identityId,
      windowStart,
      envelope.reservedMicrousd,
      identityLimitMicrousd,
    )
    .run();
  if ((result.meta?.changes ?? 1) === 0) {
    throw new RepositoryError(
      "BUDGET_EXCEEDED",
      "This request would exceed the app-funded allowance. Add your OpenAI API key in Settings to continue with BYOK.",
      429,
      true,
    );
  }
  return { id, reservedMicrousd: envelope.reservedMicrousd };
}

export async function settleProviderCost(
  reservationId: string,
  settledMicrousd: number,
  providerRequestId?: string | null,
) {
  await getD1()
    .prepare(
      `UPDATE provider_cost_reservations
       SET status = 'settled', settled_microusd = ?, provider_request_id = ?, settled_at = ?
       WHERE id = ? AND status IN ('reserved', 'uncertain')`,
    )
    .bind(
      Math.max(0, Math.round(settledMicrousd)),
      providerRequestId ?? null,
      Date.now(),
      reservationId,
    )
    .run();
}

export async function markProviderCostUncertain(
  reservationId: string,
  providerRequestId?: string | null,
) {
  await getD1()
    .prepare(
      `UPDATE provider_cost_reservations
       SET status = 'uncertain', provider_request_id = COALESCE(?, provider_request_id)
       WHERE id = ? AND status = 'reserved'`,
    )
    .bind(providerRequestId ?? null, reservationId)
    .run();
}

export async function releaseProviderCost(reservationId: string) {
  await getD1()
    .prepare(
      `UPDATE provider_cost_reservations
       SET status = 'released', released_at = ?
       WHERE id = ? AND status = 'reserved'`,
    )
    .bind(Date.now(), reservationId)
    .run();
}

function costEnvelope(requestBody: object, modelId: ModelId): CostEnvelope {
  const model = MODELS.find((candidate) => candidate.id === modelId);
  if (!model) throw new RepositoryError("BAD_REQUEST", "Choose a supported live research model.", 400);
  const body = requestBody as Record<string, unknown>;
  const inputTokenUpperBound = new TextEncoder().encode(JSON.stringify(requestBody)).byteLength;
  const maxOutputTokens = boundedInteger(body.max_output_tokens);
  const maxToolCalls = boundedInteger(body.max_tool_calls);
  const reservedMicrousd = Math.ceil(
    inputTokenUpperBound * model.inputUsdPerMillion
      + maxOutputTokens * model.outputUsdPerMillion
      + maxToolCalls * model.searchUsdPerCall * 1_000_000,
  );
  return { inputTokenUpperBound, maxOutputTokens, maxToolCalls, reservedMicrousd };
}

function boundedInteger(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 0;
}

function projectSpendLimitUsd() {
  const configured = Number(
    process.env.CURIOSITYPEDIA_DAILY_BUDGET_USD
      ?? "25",
  );
  return Number.isFinite(configured) && configured > 0 ? configured : 25;
}

export const providerCostControlTestHooks = { costEnvelope, projectSpendLimitUsd };
