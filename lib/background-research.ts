import { getD1 } from "../db";
import type { LiveResearchRequest, ResearchActivity, ResearchFailure } from "./contracts";
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
  absorbFailedResearchCosts,
  releaseProviderCost,
  reserveProviderCost,
} from "./provider-cost-control";
import { recordOpenAIUsage } from "./provider-usage";
import type { OpenAIResponse } from "./research/provider-response";
import type { ViewerContext } from "./viewer";
import {
  APPLICATION_PROVIDER_AUTH,
  type ProviderAuth,
} from "./provider-auth";

const FINALIZATION_TIMEOUT_MS = 6 * 60 * 1_000;
const FINALIZATION_LEASE_MS = FINALIZATION_TIMEOUT_MS + 15_000;
export const BACKGROUND_RESEARCH_TIMEOUT_MS = 10 * 60 * 1_000;
const PROVIDER_STATUS_TIMEOUT_MS = 10_000;
const PROVIDER_CANCEL_TIMEOUT_MS = 10_000;
const MAX_START_ATTEMPTS = 5;
const RUNNER_POLL_INTERVAL_MS = 3_000;

type BackgroundRow = {
  id: string;
  request_json: string;
  status: "reserved" | "researching" | "committed" | "failed";
  provider_response_id: string | null;
  research_checkpoint_json: string | null;
  cost_reservation_id: string | null;
  result_journey_id: string | null;
  error_code: string | null;
  error_message: string | null;
  progress_phase: "researching" | "composing" | "validating" | "saving" | null;
  progress_message: string | null;
  progress_attempt: number;
  progress_max_attempts: number;
  progress_updated_at: number | null;
  completed_at: number | null;
  started_at: number | null;
  lease_token: string | null;
  lease_expires_at: number | null;
  created_at: number;
};

type BackgroundListOptions = {
  reconcile?: boolean;
  providerAuth?: ProviderAuth;
};

export async function startBackgroundResearch(
  viewer: ViewerContext,
  request: LiveResearchRequest,
  providerAuth: ProviderAuth = APPLICATION_PROVIDER_AUTH,
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
      providerAuth,
    });
    reservationId = reservation.id;
    const response = await submitWithRetries(requestBody, prepared.requestId, providerAuth);
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
           request_json = ?, started_at = ?, error_code = NULL, error_message = NULL,
           progress_phase = 'researching',
           progress_message = 'Step 1 of 2 · OpenAI is searching sources and building the evidence dossier',
           progress_attempt = 1, progress_max_attempts = 1, progress_updated_at = ?
       WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
         AND status = 'reserved'`,
    ).bind(
      responseId,
      reservationId,
      JSON.stringify({ ...prepared, providerFunding: providerAuth.funding }),
      Date.now(),
      Date.now(),
      prepared.requestId,
      viewer.identityId,
    ).run();
    const row = await backgroundRow(viewer, prepared.requestId);
    if (!row) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
    return activityFromRow(row);
  } catch (error) {
    if (reservationId) await releaseProviderCost(reservationId);
    await failBackgroundRow(viewer, prepared.requestId, error);
    throw error;
  }
}

/**
 * Owns the long-lived HTTP request for one background job. Status polling never
 * performs work; it only reads the checkpoints this runner writes to D1.
 */
export async function runBackgroundResearch(
  viewer: ViewerContext,
  requestId: string,
  providerAuth: ProviderAuth = APPLICATION_PROVIDER_AUTH,
  signal?: AbortSignal,
): Promise<ResearchActivity> {
  while (!signal?.aborted) {
    await expireBackgroundResearch(viewer);
    const row = await backgroundRow(viewer, requestId);
    if (!row) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
    if (row.status === "committed" || row.status === "failed") return activityFromRow(row);
    const rowAuth = providerAuthForRow(row, providerAuth);
    if (!rowAuth) {
      throw new RepositoryError(
        "PROVIDER_UNAVAILABLE",
        "Reconnect the OpenAI API key used to start this research before resuming it.",
        409,
      );
    }
    if (row.provider_response_id) await reconcileRow(viewer, row, rowAuth);
    const updated = await backgroundRow(viewer, requestId);
    if (!updated) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
    if (updated.status === "committed" || updated.status === "failed") return activityFromRow(updated);
    await abortableDelay(RUNNER_POLL_INTERVAL_MS, signal);
  }
  const row = await backgroundRow(viewer, requestId);
  if (!row) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
  return activityFromRow(row);
}

export async function listBackgroundResearch(
  viewer: ViewerContext,
  { reconcile = true, providerAuth = APPLICATION_PROVIDER_AUTH }: BackgroundListOptions = {},
): Promise<ResearchActivity[]> {
  await expireBackgroundResearch(viewer);
  let rows = await backgroundRows(viewer);
  if (reconcile) {
    const work = Promise.allSettled(
      rows
        .filter((row) => row.status === "researching" && row.provider_response_id)
        .map((row) => {
          const rowAuth = providerAuthForRow(row, providerAuth);
          return rowAuth ? reconcileRow(viewer, row, rowAuth) : Promise.resolve();
        }),
    ).then((results) => {
      for (const result of results) {
        if (result.status === "rejected") {
          console.error("Background research reconciliation failed", result.reason);
        }
      }
    });
    await work;
    rows = await backgroundRows(viewer);
  }
  return rows.map(activityFromRow);
}

export async function cancelBackgroundResearch(
  viewer: ViewerContext,
  requestId: string,
  { providerAuth = APPLICATION_PROVIDER_AUTH }: Pick<BackgroundListOptions, "providerAuth"> = {},
): Promise<ResearchActivity> {
  const row = await backgroundRow(viewer, requestId);
  if (!row) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);

  if (row.status === "reserved" || row.status === "researching") {
    const rowAuth = providerAuthForRow(row, providerAuth);
    if (!rowAuth) {
      throw new RepositoryError(
        "PROVIDER_UNAVAILABLE",
        "Reconnect the OpenAI API key used to start this background research before stopping it.",
        409,
      );
    }
    await getD1().prepare(
      `UPDATE research_requests
       SET status = 'failed', error_code = 'CANCELLED',
           error_message = 'Research was stopped by you.', completed_at = ?,
           lease_token = NULL, lease_expires_at = NULL
       WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
         AND status IN ('reserved', 'researching')`,
    ).bind(Date.now(), requestId, viewer.identityId).run();
    await absorbFailedResearchCosts(viewer.identityId, requestId);

    const cleanup = cancelProviderWork(viewer, row, rowAuth).catch((error) => {
      console.error("Unable to cancel the background provider response", error);
    });
    await cleanup;
  }

  const cancelled = await backgroundRow(viewer, requestId);
  if (!cancelled) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
  return activityFromRow(cancelled);
}

export async function dismissFailedBackgroundResearch(
  viewer: ViewerContext,
  requestId: string,
): Promise<ResearchActivity> {
  const row = await backgroundRow(viewer, requestId);
  if (!row) throw new RepositoryError("NOT_FOUND", "Research request not found.", 404);
  if (row.status !== "failed") {
    throw new RepositoryError("BAD_REQUEST", "Only failed research can be removed.", 400);
  }

  await getD1().prepare(
    `UPDATE research_requests SET error_code = 'DISMISSED'
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
       AND status = 'failed'`,
  ).bind(requestId, viewer.identityId).run();
  return activityFromRow(row);
}

export async function retryBackgroundResearch(
  viewer: ViewerContext,
  requestId: string,
  providerAuth: ProviderAuth = APPLICATION_PROVIDER_AUTH,
) {
  const row = await backgroundRow(viewer, requestId);
  if (!row || row.status !== "failed") {
    throw new RepositoryError("BAD_REQUEST", "Only failed background research can be retried.", 400);
  }
  if (!providerAuthForRow(row, providerAuth)) {
    throw new RepositoryError(
      "PROVIDER_UNAVAILABLE",
      "Reconnect the OpenAI API key used for this background research before retrying it.",
      409,
    );
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
  const activity = await startBackgroundResearch(viewer, request, providerAuth);
  await getD1().prepare(
    `UPDATE research_requests SET error_code = 'RETRIED'
     WHERE id = ? AND identity_id = ? AND status = 'failed'`,
  ).bind(requestId, viewer.identityId).run();
  return activity;
}

async function submitWithRetries(body: object, idempotencyKey: string, providerAuth: ProviderAuth) {
  let lastResponse: Response | null = null;
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_START_ATTEMPTS; attempt += 1) {
    try {
      const response = await requestOpenAI(body, { idempotencyKey, apiKey: providerAuth.apiKey });
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

async function reconcileRow(viewer: ViewerContext, row: BackgroundRow, providerAuth: ProviderAuth) {
  const preparedBase = parsePrepared(row.request_json);
  let payload: OpenAIResponse;
  if (row.research_checkpoint_json) {
    payload = JSON.parse(row.research_checkpoint_json) as OpenAIResponse;
  } else {
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
      apiKey: providerAuth.apiKey,
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
  payload = await response.json() as OpenAIResponse;
  const payloadRecord: unknown = payload;
  const status = isRecord(payloadRecord) && typeof payloadRecord.status === "string"
    ? payloadRecord.status
    : "";
  if (status === "queued" || status === "in_progress") {
    await updateProgress(
      viewer,
      row.id,
      "researching",
      status === "queued"
        ? "Step 1 of 2 · OpenAI has queued the evidence search"
        : "Step 1 of 2 · Searching sources and assembling the evidence dossier",
      1,
        1,
    );
    return;
  }
  if (status !== "completed") {
    const providerFailure = classifyProviderFailure(payload, preparedBase.providerFunding === "user");
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
    await failBackgroundProviderRow(viewer, row.id, providerFailure.code, providerFailure.message);
    return;
  }
  }

  const leaseToken = crypto.randomUUID();
  const claimed = await getD1().prepare(
    `UPDATE research_requests
     SET lease_token = ?, lease_expires_at = ?, research_checkpoint_json = ?,
         progress_phase = 'composing',
         progress_message = 'Step 1 complete · Evidence dossier saved; starting Prompt 2',
         progress_attempt = 1, progress_max_attempts = 2, progress_updated_at = ?
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
       AND status = 'researching'
       AND (lease_expires_at IS NULL OR lease_expires_at <= ?)`,
  ).bind(
    leaseToken,
    Date.now() + FINALIZATION_LEASE_MS,
    JSON.stringify(payload),
    Date.now(),
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
        {
          maxVisualCurationAttempts: 1,
          providerAuth,
          onProgress: (phase, message, attempt, maxAttempts) => updateProgress(
            viewer,
            row.id,
            phase,
            message,
            attempt,
            maxAttempts,
            leaseToken,
          ),
        },
      ),
      new Promise<never>((_, reject) => {
        const rejectWhenAborted = () => reject(new RepositoryError(
          "PROVIDER_TIMEOUT",
          "Research finished, but composing and validating the visual session timed out. Please retry it.",
          504,
          true,
        ));
        finalizationController.signal.addEventListener("abort", rejectWhenAborted, { once: true });
      }),
    ]);
    await updateProgress(viewer, row.id, "saving", "Saving the completed journey", 1, 1, leaseToken);
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
         AND COALESCE(started_at, created_at) <= ?
         AND (provider_response_id IS NULL OR lease_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= ?)`,
    ).bind(now, viewer.identityId, now - BACKGROUND_RESEARCH_TIMEOUT_MS, now),
  ]);
  await absorbFailedResearchCosts(viewer.identityId);
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
  await absorbFailedResearchCosts(viewer.identityId, prepared.requestId);
}

async function cancelProviderWork(viewer: ViewerContext, row: BackgroundRow, providerAuth: ProviderAuth) {
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
    const response = await cancelOpenAIResponse(row.provider_response_id, {
      signal: controller.signal,
      apiKey: providerAuth.apiKey,
    });
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
  await absorbFailedResearchCosts(viewer.identityId, requestId);
}

async function failBackgroundProviderRow(
  viewer: ViewerContext,
  requestId: string,
  errorCode: string,
  errorMessage: string,
) {
  await getD1().prepare(
    `UPDATE research_requests
     SET status = 'failed', error_code = ?, error_message = ?, completed_at = ?,
         lease_token = NULL, lease_expires_at = NULL
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
       AND status = 'researching'`,
  ).bind(errorCode, errorMessage.slice(0, 500), Date.now(), requestId, viewer.identityId).run();
  await absorbFailedResearchCosts(viewer.identityId, requestId);
}

async function backgroundRows(viewer: ViewerContext) {
  const result = await getD1().prepare(
    `SELECT id, request_json, status, provider_response_id, research_checkpoint_json, cost_reservation_id,
            result_journey_id, error_code, error_message, completed_at, started_at,
            progress_phase, progress_message, progress_attempt, progress_max_attempts,
            progress_updated_at, lease_token, lease_expires_at, created_at
     FROM research_requests
     WHERE identity_id = ? AND execution_mode = 'background'
       AND NOT (status = 'failed' AND COALESCE(error_code, '') IN ('RETRIED', 'DISMISSED'))
     ORDER BY created_at DESC LIMIT 25`,
  ).bind(viewer.identityId).all<BackgroundRow>();
  return result.results;
}

async function backgroundRow(viewer: ViewerContext, requestId: string) {
  return getD1().prepare(
    `SELECT id, request_json, status, provider_response_id, research_checkpoint_json, cost_reservation_id,
            result_journey_id, error_code, error_message, completed_at, started_at,
            progress_phase, progress_message, progress_attempt, progress_max_attempts,
            progress_updated_at, lease_token, lease_expires_at, created_at
     FROM research_requests
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background' LIMIT 1`,
  ).bind(requestId, viewer.identityId).first<BackgroundRow>();
}

function providerAuthForRow(row: BackgroundRow, requestAuth: ProviderAuth): ProviderAuth | null {
  // App-funded and legacy responses use the deployment key that created them.
  // BYOK work can only be resumed while the browser supplies its ephemeral key.
  const funding = parsePrepared(row.request_json).providerFunding;
  if (funding !== "user") return APPLICATION_PROVIDER_AUTH;
  return requestAuth.funding === "user" ? requestAuth : null;
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
    phase: row.status === "researching" ? (row.progress_phase ?? (row.lease_token ? "composing" : "researching")) : null,
    progressMessage: row.progress_message,
    attempt: row.progress_attempt ?? 1,
    maxAttempts: row.progress_max_attempts ?? 1,
    progressUpdatedAt: row.progress_updated_at,
    journeyId: row.result_journey_id ?? prepared.journeyId ?? null,
    error: row.error_message,
    errorCode: row.error_code,
    failure: failureFromRow(row, prepared.providerFunding === "user"),
    createdAt: row.created_at,
    startedAt: row.started_at,
    timeoutAt: row.status === "reserved" || row.status === "researching"
      ? row.lease_token && row.lease_expires_at
        ? row.lease_expires_at
        : (row.started_at ?? row.created_at) + BACKGROUND_RESEARCH_TIMEOUT_MS
      : null,
    completedAt: row.completed_at,
  };
}

function classifyProviderFailure(payload: OpenAIResponse, usesOwnKey: boolean) {
  const error = isRecord(payload.error) ? payload.error : null;
  const code = error && typeof error.code === "string" ? error.code : "";
  const rawMessage = error && typeof error.message === "string" ? error.message : "";
  if (code === "rate_limit_exceeded") {
    const limit = numberFromProviderMessage(rawMessage, /Limit\s+([\d,]+)/i);
    const used = numberFromProviderMessage(rawMessage, /Used\s+([\d,]+)/i);
    const requested = numberFromProviderMessage(rawMessage, /Requested\s+([\d,]+)/i);
    const retrySeconds = numberFromProviderMessage(rawMessage, /try again in\s+([\d.]+)s/i);
    const capacity = limit && used && requested
      ? ` The project limit is ${limit.toLocaleString()} tokens per minute; ${used.toLocaleString()} were already in use and this step requested ${requested.toLocaleString()} more.`
      : "";
    const retry = retrySeconds ? ` OpenAI suggested retrying after about ${Math.ceil(retrySeconds)} seconds.` : "";
    return {
      code: "OPENAI_RATE_LIMIT",
      message: `OpenAI stopped this research because the API project reached its token rate limit.${capacity}${retry}`,
    };
  }
  if (code === "insufficient_quota") {
    return {
      code: "OPENAI_QUOTA_EXHAUSTED",
      message: "OpenAI stopped this research because the API project has no available credits or reached its spending limit.",
    };
  }
  if (["invalid_api_key", "authentication_error"].includes(code)) {
    return {
      code: "OPENAI_AUTHENTICATION",
      message: "OpenAI rejected the API key used for this research.",
    };
  }
  if (["model_not_found", "permission_denied", "forbidden"].includes(code)) {
    return {
      code: "OPENAI_ACCESS",
      message: "OpenAI rejected this research because the API project does not have access to the selected model or operation.",
    };
  }
  return {
    code: "OPENAI_PROVIDER_FAILED",
    message: usesOwnKey
      ? "OpenAI ended this research before completing the evidence dossier. Your API key remains private; retry or review the key's OpenAI project."
      : "OpenAI ended this research before completing the evidence dossier. Please retry it.",
  };
}

function numberFromProviderMessage(message: string, pattern: RegExp) {
  const match = message.match(pattern)?.[1];
  if (!match) return null;
  const value = Number(match.replaceAll(",", ""));
  return Number.isFinite(value) ? value : null;
}

function failureFromRow(
  row: BackgroundRow,
  usesOwnKey: boolean,
): ResearchFailure | null {
  const message = row.error_message ?? "This research could not be completed.";
  switch (row.error_code) {
    case "OPENAI_RATE_LIMIT":
      return {
        source: "openai",
        category: "rate_limit",
        title: "OpenAI rate limit reached",
        message,
        recommendation: usesOwnKey
          ? "Wait briefly and retry. A new key from the same OpenAI project normally shares the same limit; use another key only if it belongs to a project with separate capacity."
          : "Wait briefly and retry. CuriosityPedia will not count this failed research against your allowance.",
        actionLabel: "Review OpenAI limits",
        actionUrl: "https://platform.openai.com/settings/organization/limits",
        allowKeyChange: usesOwnKey,
      };
    case "OPENAI_QUOTA_EXHAUSTED":
      return {
        source: "openai",
        category: "quota",
        title: "OpenAI API quota unavailable",
        message,
        recommendation: "Review the API project's credits and spending limit, or use a key from a project with available API capacity.",
        actionLabel: "Review OpenAI billing",
        actionUrl: "https://platform.openai.com/settings/organization/billing",
        allowKeyChange: usesOwnKey,
      };
    case "OPENAI_AUTHENTICATION":
      return {
        source: "openai",
        category: "authentication",
        title: "OpenAI rejected the API key",
        message,
        recommendation: "Remove the current key and connect a valid OpenAI project API key.",
        actionLabel: "Manage OpenAI API keys",
        actionUrl: "https://platform.openai.com/api-keys",
        allowKeyChange: usesOwnKey,
      };
    case "OPENAI_ACCESS":
      return {
        source: "openai",
        category: "access",
        title: "OpenAI project access required",
        message,
        recommendation: "Check the selected model and the permissions of the project associated with this API key.",
        actionLabel: "Open OpenAI Platform",
        actionUrl: "https://platform.openai.com/settings/organization/projects",
        allowKeyChange: usesOwnKey,
      };
    case "OPENAI_PROVIDER_FAILED":
    case "PROVIDER_ERROR":
      return {
        source: "openai",
        category: "provider",
        title: "OpenAI did not complete the research",
        message,
        recommendation: "Retry the research. If it repeats, review the API project status or connect a different eligible project key.",
        actionLabel: "Open OpenAI Platform",
        actionUrl: "https://platform.openai.com/",
        allowKeyChange: usesOwnKey,
      };
    default:
      return null;
  }
}

async function updateProgress(
  viewer: ViewerContext,
  requestId: string,
  phase: NonNullable<ResearchActivity["phase"]>,
  message: string,
  attempt: number,
  maxAttempts: number,
  leaseToken?: string,
) {
  const leaseClause = leaseToken ? " AND lease_token = ?" : "";
  const statement = getD1().prepare(
    `UPDATE research_requests
     SET progress_phase = ?, progress_message = ?, progress_attempt = ?,
         progress_max_attempts = ?, progress_updated_at = ?
     WHERE id = ? AND identity_id = ? AND execution_mode = 'background'
       AND status = 'researching'${leaseClause}`,
  );
  const values: unknown[] = [phase, message.slice(0, 500), attempt, maxAttempts, Date.now(), requestId, viewer.identityId];
  if (leaseToken) values.push(leaseToken);
  await statement.bind(...values).run();
}

function abortableDelay(milliseconds: number, signal?: AbortSignal) {
  if (!signal) return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
  if (signal.aborted) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      clearTimeout(timeout);
      resolve();
    }, { once: true });
  });
}
