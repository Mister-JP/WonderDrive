import { getD1 } from "../db";
import type { LiveResearchRequest, ResearchActivity } from "./contracts";
import { RepositoryError } from "./errors";
import {
  assertLiveResearchLease,
  commitLiveResearch,
  prepareBackgroundLiveResearch,
} from "./live-repository";
import {
  finalizeLiveResearchResponse,
  LIVE_RESEARCH_RESPONSE_INCLUDES,
  liveResearchRequestBody,
  type PreparedLiveResearch,
} from "./live-research";
import {
  cancelOpenAIResponse,
  isRecord,
  requestOpenAI,
  retrieveOpenAIResponse,
} from "./openai";
import {
  releaseProviderCost,
  reserveProviderCost,
} from "./provider-cost-control";
import { recordOpenAIUsage } from "./provider-usage";
import type { OpenAIResponse } from "./research/provider-response";
import type { ViewerContext } from "./viewer";

const FINALIZATION_TIMEOUT_MS = 2.5 * 60 * 1_000;
const FINALIZATION_LEASE_MS = FINALIZATION_TIMEOUT_MS + 15_000;
export const BACKGROUND_RESEARCH_TIMEOUT_MS = 10 * 60 * 1_000;
const PROVIDER_STATUS_TIMEOUT_MS = 10_000;
const PROVIDER_CANCEL_TIMEOUT_MS = 10_000;
const MAX_START_ATTEMPTS = 5;

type BackgroundRow = {
  id: string;
  request_json: string;
  status: "reserved" | "researching" | "committed" | "failed";
  provider_response_id: string | null;
  cost_reservation_id: string | null;
  result_journey_id: string | null;
  error_code: string | null;
  error_message: string | null;
  completed_at: number | null;
  started_at: number | null;
  lease_token: string | null;
  lease_expires_at: number | null;
  created_at: number;
};

type BackgroundListOptions = {
  reconcile?: boolean;
  defer?: (work: Promise<unknown>) => void;
};

export async function startBackgroundResearch(
  viewer: ViewerContext,
  request: LiveResearchRequest,
): Promise<ResearchActivity> {
  const preparation = await prepareBackgroundLiveResearch(viewer, request);
  if (preparation.type === "existing") {
    const existing = await backgroundRow(viewer, preparation.requestId);
    if (!existing) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
    return activityFromRow(existing);
  }

  const { prepared } = preparation;
  const requestBody = liveResearchRequestBody(prepared, { background: true });
  let reservationId: string | null = null;
  try {
    const reservation = await reserveProviderCost({
      callKey: `${prepared.requestId}:background_start`,
      identityId: prepared.identityId,
      viewerMode: prepared.viewerMode,
      modelId: prepared.modelId,
      operation: "live_research",
      requestBody,
      researchRequestId: prepared.requestId,
    });
    reservationId = reservation.id;
    const response = await submitWithRetries(requestBody, prepared.requestId);
    const payload = await response.json() as unknown;
    const responseId = isRecord(payload) && typeof payload.id === "string" ? payload.id : null;
    if (!responseId) {
      throw new RepositoryError(
        "PROVIDER_ERROR",
        "OpenAI accepted the request without returning a response identifier.",
        502,
        true,
      );
    }
    await getD1().prepare(
      `UPDATE research_requests
       SET status = 'researching', provider_response_id = ?, cost_reservation_id = ?,
           started_at = ?, error_code = NULL, error_message = NULL
       WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
         AND status = 'reserved'`,
    ).bind(responseId, reservationId, Date.now(), prepared.requestId, viewer.identityId).run();
    const row = await backgroundRow(viewer, prepared.requestId);
    if (!row) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
    return activityFromRow(row);
  } catch (error) {
    if (reservationId) await releaseProviderCost(reservationId);
    await failBackgroundRow(viewer, prepared.requestId, error);
    throw error;
  }
}

export async function listBackgroundResearch(
  viewer: ViewerContext,
  { reconcile = true, defer }: BackgroundListOptions = {},
): Promise<ResearchActivity[]> {
  await expireBackgroundResearch(viewer);
  let rows = await backgroundRows(viewer);
  if (reconcile) {
    const work = Promise.allSettled(
      rows
        .filter((row) => row.status === "researching" && row.provider_response_id)
        .map((row) => reconcileRow(viewer, row)),
    ).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Background research reconciliation failed", result.reason);
        }
      }
    });
    if (defer) {
      defer(work);
    } else {
      await work;
      rows = await backgroundRows(viewer);
    }
  }
  return rows.map(activityFromRow);
}

export async function cancelBackgroundResearch(
  viewer: ViewerContext,
  requestId: string,
  { defer }: Pick<BackgroundListOptions, "defer"> = {},
): Promise<ResearchActivity> {
  const row = await backgroundRow(viewer, requestId);
  if (!row) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);

  if (row.status === "reserved" || row.status === "researching") {
    await getD1().prepare(
      `UPDATE research_requests
       SET status = 'failed', error_code = 'CANCELLED',
           error_message = 'Research was stopped by you.', completed_at = ?,
           lease_token = NULL, lease_expires_at = NULL
       WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
         AND status IN ('reserved', 'researching')`,
    ).bind(Date.now(), requestId, viewer.identityId).run();

    const cleanup = cancelProviderWork(viewer, row).catch((error) => {
      console.error("Unable to cancel the background provider response", error);
    });
    if (defer) defer(cleanup);
    else await cleanup;
  }

  const cancelled = await backgroundRow(viewer, requestId);
  if (!cancelled) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
  return activityFromRow(cancelled);
}

export async function retryBackgroundResearch(viewer: ViewerContext, requestId: string) {
  const row = await backgroundRow(viewer, requestId);
  if (!row || row.status !== "failed") {
    throw new RepositoryError("BAD_REQUEST", "Only failed background research can be retried.", 400);
  }
  if (
    row.provider_response_id
    && ["SCHEMA_INVALID", "RESEARCH_VALIDATION_FAILED", "BUDGET_EXCEEDED"].includes(row.error_code ?? "")
  ) {
    await getD1().prepare(
      `UPDATE research_requests
       SET status = 'researching', error_code = NULL, error_message = NULL,
           completed_at = NULL, lease_token = NULL, lease_expires_at = NULL
       WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
         AND status = 'failed'`,
    ).bind(requestId, viewer.identityId).run();
    const recovered = await backgroundRow(viewer, requestId);
    if (!recovered) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
    return activityFromRow(recovered);
  }
  const prepared = parsePrepared(row.request_json);
  const request: LiveResearchRequest = prepared.kind === "create"
    ? {
        kind: "create",
        seed: prepared.seed,
        performerId: prepared.performerId,
        modelId: prepared.modelId,
        researchPreset: prepared.researchPreset,
        answerDensity: prepared.answerDensity,
        outputLocale: prepared.outputLocale,
        idempotencyKey: crypto.randomUUID(),
      }
    : {
        kind: "advance",
        journeyId: prepared.journeyId!,
        fromTurnId: prepared.fromTurnId!,
        action: prepared.action!,
        modelId: prepared.modelId,
        optionId: prepared.selectedOptionId,
        question: prepared.action === "explore" ? prepared.question : undefined,
        sourcePageUrl: prepared.sourcePageUrl,
        expectedVersion: prepared.expectedVersion!,
        idempotencyKey: crypto.randomUUID(),
      };
  const activity = await startBackgroundResearch(viewer, request);
  await getD1().prepare(
    `UPDATE research_requests SET error_code = 'RETRIED'
     WHERE id = ? AND identity_id = ? AND status = 'failed'`,
  ).bind(requestId, viewer.identityId).run();
  return activity;
}

async function submitWithRetries(body: object, idempotencyKey: string) {
  let lastResponse: Response | null = null;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt += 1) {
    try {
      const response = await requestOpenAI(body, { idempotencyKey });
      if (response.ok) return response;
      lastResponse = response;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error;
    }
    if (attempt < MAX_START_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, Math.min(250 * 2 ** (attempt - 1), 2_000)));
    }
  }
  if (lastResponse) {
    throw new RepositoryError(
      "PROVIDER_ERROR",
      `OpenAI could not start background research (${lastResponse.status}).`,
      502,
      lastResponse.status === 429 || lastResponse.status >= 500,
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new RepositoryError("PROVIDER_UNAVAILABLE", "OpenAI could not start background research.", 503, true);
}

async function reconcileRow(viewer: ViewerContext, row: BackgroundRow) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("CuriosityPedia background status timeout"),
    PROVIDER_STATUS_TIMEOUT_MS,
  );
  let response: Response;
  try {
    response = await retrieveOpenAIResponse(row.provider_response_id!, {
      include: LIVE_RESEARCH_RESPONSE_INCLUDES,
      signal: controller.signal,
    });
  } catch (error) {
    if (!controller.signal.aborted) throw error;
    return;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    if (response.status === 404) {
      await failBackgroundRow(
        viewer,
        row.id,
        new RepositoryError("PROVIDER_ERROR", "The background result expired. Please retry it.", 502, true),
      );
    }
    return;
  }
  const payload = await response.json() as OpenAIResponse;
  const payloadRecord: unknown = payload;
  const status = isRecord(payloadRecord) && typeof payloadRecord.status === "string"
    ? payloadRecord.status
    : "";
  if (status === "queued" || status === "in_progress") return;
  const preparedBase = parsePrepared(row.request_json);

  if (status !== "completed") {
    await recordOpenAIUsage({
      identityId: viewer.identityId,
      researchRequestId: row.id,
      modelId: preparedBase.modelId,
      operation: "live_research",
      purpose: "opening_turn_background",
      costReservationId: row.cost_reservation_id ?? undefined,
      outcome: status === "incomplete" ? "incomplete" : "provider_failed",
      response: payload,
      providerRequestId: row.provider_response_id,
      latencyMs: Date.now() - row.created_at,
    });
    await failBackgroundRow(
      viewer,
      row.id,
      new RepositoryError("PROVIDER_ERROR", "Background research did not complete. Please retry it.", 502, true),
    );
    return;
  }

  const leaseToken = crypto.randomUUID();
  const claimed = await getD1().prepare(
    `UPDATE research_requests
     SET lease_token = ?, lease_expires_at = ?
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
       AND status = 'researching'
       AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
  ).bind(
    leaseToken,
    Date.now() + FINALIZATION_LEASE_MS,
    row.id,
    viewer.identityId,
    Date.now(),
  ).run();
  if ((claimed.meta.changes ?? 0) === 0) return;

  // CuriosityPedia is image-driven. Background completion uses the same required
  // visual-evidence contract and supplemental curation path as foreground research.
  const prepared: PreparedLiveResearch = {
    ...preparedBase,
    leaseToken,
    imagePreference: "prefer",
  };
  const finalizationController = new AbortController();
  const finalizationTimeout = setTimeout(
    () => finalizationController.abort("CuriosityPedia background finalization timeout"),
    FINALIZATION_TIMEOUT_MS,
  );
  try {
    if (!await hasRecordedBackgroundUsage(row)) {
      await recordOpenAIUsage({
        identityId: viewer.identityId,
        researchRequestId: row.id,
        modelId: prepared.modelId,
        operation: "live_research",
        purpose: "opening_turn_background",
        costReservationId: row.cost_reservation_id ?? undefined,
        outcome: "completed",
        response: payload,
        providerRequestId: row.provider_response_id,
        latencyMs: Date.now() - row.created_at,
      });
    }
    const draft = await Promise.race([
      finalizeLiveResearchResponse(
        prepared,
        payload,
        () => {},
        finalizationController.signal,
        () => assertLiveResearchLease(viewer, prepared),
        { maxVisualCurationAttempts: 1 },
      ),
      new Promise<never>((_, reject) => {
        const rejectWhenAborted = () => reject(new RepositoryError(
          "PROVIDER_TIMEOUT",
          "Research finished, but preparing its citations and images timed out. Please retry it.",
          504,
          true,
        ));
        finalizationController.signal.addEventListener("abort", rejectWhenAborted, { once: true });
      }),
    ]);
    await commitLiveResearch(viewer, prepared, draft);
  } catch (error) {
    await markBackgroundFinalizationFailed(viewer, prepared, error);
  } finally {
    clearTimeout(finalizationTimeout);
  }
}

async function expireBackgroundResearch(viewer: ViewerContext) {
  const now = Date.now();
  await getD1().batch([
    getD1().prepare(
      `UPDATE research_requests
       SET status = 'failed', error_code = 'PROVIDER_UNAVAILABLE',
           error_message = 'Research did not start. Please retry it.', completed_at = ?,
           lease_token = NULL, lease_expires_at = NULL
       WHERE identity_id = ? AND execution_mode = 'background' AND status = 'reserved'
         AND created_at <= ?`,
    ).bind(now, viewer.identityId, now - 2 * 60_000),
    getD1().prepare(
      `UPDATE research_requests
       SET status = 'failed', error_code = 'PROVIDER_TIMEOUT',
           error_message = 'Background research reached its 10-minute limit. Please retry it.',
           completed_at = ?, lease_token = NULL, lease_expires_at = NULL
       WHERE identity_id = ? AND execution_mode = 'background' AND status = 'researching'
         AND COALESCE(started_at, created_at) <= ?`,
    ).bind(now, viewer.identityId, now - BACKGROUND_RESEARCH_TIMEOUT_MS),
  ]);
}

async function markBackgroundFinalizationFailed(
  viewer: ViewerContext,
  prepared: PreparedLiveResearch,
  error: unknown,
) {
  const repositoryError = error instanceof RepositoryError ? error : null;
  await getD1().prepare(
    `UPDATE research_requests
     SET status = 'failed', error_code = ?, error_message = ?, completed_at = ?,
         lease_token = NULL, lease_expires_at = NULL
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
       AND status = 'researching' AND lease_token = ?`,
  ).bind(
    repositoryError?.code ?? "INTERNAL_ERROR",
    (repositoryError?.message ?? "Unexpected background research failure").slice(0, 500),
    Date.now(),
    prepared.requestId,
    viewer.identityId,
    prepared.leaseToken,
  ).run();
}

async function cancelProviderWork(viewer: ViewerContext, row: BackgroundRow) {
  if (!row.provider_response_id) {
    if (row.cost_reservation_id) await releaseProviderCost(row.cost_reservation_id);
    return;
  }
  const prepared = parsePrepared(row.request_json);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort("CuriosityPedia background cancellation timeout"),
    PROVIDER_CANCEL_TIMEOUT_MS,
  );
  try {
    const response = await cancelOpenAIResponse(row.provider_response_id, { signal: controller.signal });
    const payload: unknown = response.ok ? await response.json() : undefined;
    if (!await hasRecordedBackgroundUsage(row)) {
      await recordOpenAIUsage({
        identityId: viewer.identityId,
        researchRequestId: row.id,
        modelId: prepared.modelId,
        operation: "live_research",
        purpose: "opening_turn_background",
        costReservationId: row.cost_reservation_id ?? undefined,
        outcome: response.ok && isRecord(payload) && payload.status === "completed"
          ? "completed"
          : response.ok ? "provider_failed" : "http_error",
        response: payload,
        providerRequestId: row.provider_response_id,
        httpStatus: response.status,
        latencyMs: Date.now() - row.created_at,
        errorCode: "CANCELLED",
        errorMessage: "Background research was stopped by the learner.",
      });
    }
  } catch {
    if (row.cost_reservation_id && !await hasRecordedBackgroundUsage(row)) {
      await recordOpenAIUsage({
        identityId: viewer.identityId,
        researchRequestId: row.id,
        modelId: prepared.modelId,
        operation: "live_research",
        purpose: "opening_turn_background",
        costReservationId: row.cost_reservation_id,
        outcome: "transport_error",
        providerRequestId: row.provider_response_id,
        latencyMs: Date.now() - row.created_at,
        errorCode: controller.signal.aborted ? "CANCEL_TIMEOUT" : "CANCEL_ERROR",
        errorMessage: "The local research was stopped; provider cancellation could not be confirmed.",
      });
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function failBackgroundRow(viewer: ViewerContext, requestId: string, error: unknown) {
  const repositoryError = error instanceof RepositoryError ? error : null;
  await getD1().prepare(
    `UPDATE research_requests
     SET status = 'failed', error_code = ?, error_message = ?, completed_at = ?
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
       AND status IN ('reserved', 'researching')`,
  ).bind(
    repositoryError?.code ?? "INTERNAL_ERROR",
    (repositoryError?.message ?? "Unexpected background research failure").slice(0, 500),
    Date.now(),
    requestId,
    viewer.identityId,
  ).run();
}

async function backgroundRows(viewer: ViewerContext) {
  const result = await getD1().prepare(
    `SELECT id, request_json, status, provider_response_id, cost_reservation_id,
            result_journey_id, error_code, error_message, completed_at, started_at,
            lease_token, lease_expires_at, created_at
     FROM research_requests
     WHERE identity_id = ? AND execution_mode = 'background'
       AND NOT (status = 'failed' AND error_code = 'RETRIED')
     ORDER BY created_at DESC LIMIT 25`,
  ).bind(viewer.identityId).all<BackgroundRow>();
  return result.results;
}

async function backgroundRow(viewer: ViewerContext, requestId: string) {
  return getD1().prepare(
    `SELECT id, request_json, status, provider_response_id, cost_reservation_id,
            result_journey_id, error_code, error_message, completed_at, started_at,
            lease_token, lease_expires_at, created_at
     FROM research_requests
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background' LIMIT 1`,
  ).bind(requestId, viewer.identityId).first<BackgroundRow>();
}

async function hasRecordedBackgroundUsage(row: BackgroundRow) {
  const existing = await getD1().prepare(
    `SELECT id FROM provider_usage_events
     WHERE research_request_id = ? AND provider_response_id = ?
       AND purpose = 'opening_turn_background' AND outcome = 'completed'
     LIMIT 1`,
  ).bind(row.id, row.provider_response_id).first<{ id: string }>();
  return Boolean(existing);
}

function parsePrepared(value: string): PreparedLiveResearch {
  const parsed = JSON.parse(value) as PreparedLiveResearch;
  if (!parsed || !["create", "advance"].includes(parsed.kind) || typeof parsed.requestId !== "string") {
    throw new RepositoryError("INTERNAL_ERROR", "The stored background request is invalid.", 500);
  }
  return { ...parsed, imagePreference: "prefer" };
}

function activityFromRow(row: BackgroundRow): ResearchActivity {
  const prepared = parsePrepared(row.request_json);
  return {
    id: row.id,
    question: prepared.question,
    performerId: prepared.performerId,
    status: row.status === "committed" ? "ready" : row.status === "failed" ? "failed" : "researching",
    phase: row.status === "researching" ? (row.lease_token ? "finalizing" : "researching") : null,
    journeyId: row.result_journey_id ?? prepared.journeyId ?? null,
    error: row.error_message,
    createdAt: row.created_at,
    startedAt: row.started_at,
    timeoutAt: row.status === "reserved" || row.status === "researching"
      ? Math.min(
        (row.started_at ?? row.created_at) + BACKGROUND_RESEARCH_TIMEOUT_MS,
        row.lease_expires_at ?? Number.POSITIVE_INFINITY,
      )
      : null,
    completedAt: row.completed_at,
  };
}
