import { getD1 } from "../db";
import { MODELS } from "./catalog";
import type { ModelId } from "./contracts";
import { isRecord } from "./openai";
import {
  markProviderCostUncertain,
  releaseProviderCost,
  settleProviderCost,
} from "./provider-cost-control";
import type { ProviderCostOperation } from "./provider-cost-control";

type ProviderOperation = ProviderCostOperation;

type ProviderOutcome =
  | "completed"
  | "incomplete"
  | "provider_failed"
  | "http_error"
  | "transport_error"
  | "validation_failed";

export type OpenAIUsageSummary = {
  providerResponseId: string | null;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  webSearchCalls: number;
  pageFetches: number;
  estimatedCostUsd: number;
  rateEffectiveAt: string;
};

type ProviderUsageContext = {
  identityId?: string;
  journeyId?: string;
  turnId?: string;
  researchRequestId?: string;
  modelId: ModelId;
  operation: ProviderOperation;
  purpose: string;
};

type RecordProviderUsageInput = ProviderUsageContext & {
  costReservationId?: string;
  outcome: ProviderOutcome;
  response?: unknown;
  providerRequestId?: string | null;
  httpStatus?: number;
  latencyMs: number;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, string | number | boolean | null>;
};

const DIAGNOSTIC_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;

export function summarizeOpenAIUsage(response: unknown, modelId: ModelId): OpenAIUsageSummary {
  const payload = isRecord(response) ? response : {};
  const usage = isRecord(payload.usage) ? payload.usage : {};
  const inputDetails = isRecord(usage.input_tokens_details) ? usage.input_tokens_details : {};
  const outputDetails = isRecord(usage.output_tokens_details) ? usage.output_tokens_details : {};
  const inputTokens = numberValue(usage.input_tokens);
  const cachedInputTokens = numberValue(inputDetails.cached_tokens);
  const outputTokens = numberValue(usage.output_tokens);
  const model = MODELS.find((candidate) => candidate.id === modelId);
  const webSearchCalls = countWebSearchCalls(payload.output);
  const pageFetches = countPageFetches(payload.output);
  const estimatedCostUsd = model
    ? ((Math.max(0, inputTokens - cachedInputTokens) * model.inputUsdPerMillion +
        cachedInputTokens * model.cachedInputUsdPerMillion +
        outputTokens * model.outputUsdPerMillion) /
        1_000_000) +
      webSearchCalls * model.searchUsdPerCall
    : 0;
  return {
    providerResponseId: stringValue(payload.id) || null,
    inputTokens,
    cachedInputTokens,
    outputTokens,
    reasoningTokens: numberValue(outputDetails.reasoning_tokens),
    totalTokens: numberValue(usage.total_tokens),
    webSearchCalls,
    pageFetches,
    estimatedCostUsd,
    rateEffectiveAt: model?.priceEffectiveAt ?? "unknown",
  };
}

export async function recordOpenAIUsage(input: RecordProviderUsageInput): Promise<OpenAIUsageSummary> {
  const usage = summarizeOpenAIUsage(input.response, input.modelId);
  if (input.costReservationId) {
    try {
      if (hasUsagePayload(input.response)) {
        await settleProviderCost(
          input.costReservationId,
          Math.round(usage.estimatedCostUsd * 1_000_000),
          input.providerRequestId ?? usage.providerResponseId,
        );
      } else if (input.outcome === "http_error") {
        // A rejected HTTP request never started model work, so it must not
        // retain a full model-priced hold or poison automatic retries.
        await releaseProviderCost(input.costReservationId);
      } else {
        await markProviderCostUncertain(input.costReservationId, input.providerRequestId);
      }
    } catch (error) {
      // The full reservation remains authoritative if settlement cannot be persisted.
      console.error("CuriosityPedia provider cost settlement failed", error);
    }
  }
  let db: D1Database;
  try {
    db = getD1();
  } catch {
    // Unit tests and static rendering intentionally run without a D1 binding.
    return usage;
  }
  try {
    const eventId = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO provider_usage_events
          (id, identity_id, journey_id, turn_id, research_request_id, provider, model_id,
           operation, purpose, outcome, provider_response_id, provider_request_id, http_status,
           input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
           web_search_calls, page_fetches, estimated_cost_microusd, rate_effective_at,
           latency_ms, error_code, error_message, metadata_json, created_at)
         VALUES (?, ?, ?, ?, ?, 'openai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        eventId,
        input.identityId ?? null,
        input.journeyId ?? null,
        input.turnId ?? null,
        input.researchRequestId ?? null,
        input.modelId,
        input.operation,
        input.purpose.slice(0, 80),
        input.outcome,
        usage.providerResponseId,
        input.providerRequestId ?? null,
        input.httpStatus ?? null,
        usage.inputTokens,
        usage.cachedInputTokens,
        usage.outputTokens,
        usage.reasoningTokens,
        usage.totalTokens,
        usage.webSearchCalls,
        usage.pageFetches,
        Math.round(usage.estimatedCostUsd * 1_000_000),
        usage.rateEffectiveAt,
        Math.max(0, Math.round(input.latencyMs)),
        input.errorCode?.slice(0, 80) ?? null,
        input.errorMessage?.slice(0, 500) ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
        Date.now(),
      )
      .run();
    // Diagnostics are intentionally short-lived. Cleanup is opportunistic so
    // it requires no cron, queue, or paid logging service.
    await db
      .prepare("DELETE FROM provider_usage_events WHERE created_at < ?")
      .bind(Date.now() - DIAGNOSTIC_RETENTION_MS)
      .run();
  } catch (error) {
    // Provider work must not be discarded because analytics persistence failed.
    console.error("CuriosityPedia provider usage analytics write failed", error);
  }
  return usage;
}

function hasUsagePayload(response: unknown) {
  return isRecord(response) && isRecord(response.usage);
}

function countWebSearchCalls(output: unknown): number {
  return Array.isArray(output)
    ? output.filter((item) => isRecord(item) && item.type === "web_search_call").length
    : 0;
}

function countPageFetches(output: unknown): number {
  if (!Array.isArray(output)) return 0;
  return output.filter((item) => {
    if (!isRecord(item) || !isRecord(item.action)) return false;
    const type = stringValue(item.action.type);
    return type === "open_page" || type === "find_in_page" || type === "open" || type === "find";
  }).length;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
