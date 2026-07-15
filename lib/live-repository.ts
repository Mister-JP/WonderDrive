import {
  MODELS,
  PERFORMERS,
  PROMPT_VERSION,
  modelById,
  performerById,
} from "./catalog";
import type {
  JourneyDetail,
  LiveResearchRequest,
  ResearchPreset,
} from "./contracts";
import { getD1 } from "../db";
import type { ViewerContext } from "./viewer";
import {
  getJourney,
} from "./repository";
import { RepositoryError } from "./errors";
import type { LiveTurnDraft, PreparedLiveResearch } from "./live-research";
import {
  assertId,
  assertIdempotencyKey,
  hashPayload,
  normalizeSeed,
  titleFromSeed,
} from "./request";
import { optionStatements } from "./turn-options";

const PRESETS: ResearchPreset[] = ["spark", "standard", "deep"];

type LivePreparation =
  | { type: "ready"; prepared: PreparedLiveResearch }
  | { type: "replay"; journey: JourneyDetail; requestId: string };

export async function prepareLiveResearch(
  viewer: ViewerContext,
  request: LiveResearchRequest,
): Promise<LivePreparation> {
  assertIdempotencyKey(request?.idempotencyKey);
  const db = getD1();
  const normalized = await normalizeRequest(viewer, request);
  const payloadHash = await hashPayload(normalized.payload);

  const prior = await db
    .prepare(
      `SELECT id, payload_hash, status, result_journey_id
       FROM research_requests
       WHERE identity_id = ? AND idempotency_key = ? LIMIT 1`,
    )
    .bind(viewer.identityId, request.idempotencyKey)
    .first<{
      id: string;
      payload_hash: string;
      status: "reserved" | "researching" | "committed" | "failed";
      result_journey_id: string | null;
    }>();
  if (prior) {
    if (prior.payload_hash !== payloadHash) {
      throw new RepositoryError(
        "IDEMPOTENCY_CONFLICT",
        "That request key was already used for different research.",
        409,
      );
    }
    if (prior.status === "committed" && prior.result_journey_id) {
      return {
        type: "replay",
        journey: await getJourney(viewer, prior.result_journey_id),
        requestId: prior.id,
      };
    }
    throw new RepositoryError(
      "IDEMPOTENCY_CONFLICT",
      prior.status === "failed"
        ? "That research attempt ended without a saved turn. Retry with a new request key."
        : "That foreground research request is already in progress.",
      409,
      prior.status !== "failed",
    );
  }

  const now = Date.now();
  const activeLease = await db
    .prepare(
      `SELECT id FROM research_requests
       WHERE identity_id = ? AND status IN ('reserved', 'researching') AND started_at >= ?
       ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(viewer.identityId, now - 130_000)
    .first<{ id: string }>();
  if (activeLease) {
    throw new RepositoryError(
      "ALREADY_IN_PROGRESS",
      "Another foreground research run is active for this identity. Return to that tab or wait for its lease to expire.",
      409,
      true,
    );
  }

  const configuredProjectBudget = Number(process.env.WONDERDRIVE_DAILY_BUDGET_USD ?? "25");
  const projectBudgetUsd = Number.isFinite(configuredProjectBudget) && configuredProjectBudget > 0
    ? configuredProjectBudget
    : 25;
  const spend = await db
    .prepare(
      `SELECT COALESCE(SUM(estimated_cost_microusd), 0) AS project_spend,
              COALESCE(SUM(CASE WHEN identity_id = ? THEN estimated_cost_microusd ELSE 0 END), 0) AS identity_spend
       FROM provider_usage_events WHERE created_at >= ?`,
    )
    .bind(viewer.identityId, now - 86_400_000)
    .first<{ project_spend: number; identity_spend: number }>();
  const identityBudgetUsd = viewer.mode === "guest" ? 1 : 5;
  if ((spend?.project_spend ?? 0) >= projectBudgetUsd * 1_000_000) {
    throw new RepositoryError(
      "BUDGET_EXCEEDED",
      "WonderDrive’s live research budget is paused for this 24-hour window.",
      429,
      true,
    );
  }
  if ((spend?.identity_spend ?? 0) >= identityBudgetUsd * 1_000_000) {
    throw new RepositoryError(
      "BUDGET_EXCEEDED",
      `This ${viewer.mode === "guest" ? "guest" : "account"} has reached its live research spend ceiling for the last 24 hours.`,
      429,
      true,
    );
  }

  const liveLimit = viewer.mode === "guest" ? 4 : 20;
  const recent = await db
    .prepare(
      `SELECT COUNT(*) AS count FROM research_requests
       WHERE identity_id = ? AND created_at >= ?
         AND status IN ('reserved', 'researching', 'committed')`,
    )
    .bind(viewer.identityId, Date.now() - 86_400_000)
    .first<{ count: number }>();
  if ((recent?.count ?? 0) >= liveLimit) {
    throw new RepositoryError(
      "LIVE_RESEARCH_LIMIT",
      `This ${viewer.mode === "guest" ? "guest" : "account"} has reached its ${liveLimit}-run live research limit for the last 24 hours.`,
      429,
      true,
    );
  }

  const requestId = crypto.randomUUID();
  const prepared: PreparedLiveResearch = {
    requestId,
    identityId: viewer.identityId,
    kind: request.kind,
    question: normalized.question,
    seed: normalized.seed,
    depth: normalized.depth,
    performerId: normalized.performerId,
    modelId: normalized.modelId,
    researchPreset: normalized.researchPreset,
    answerDensity: normalized.answerDensity,
    imagePreference: normalized.imagePreference,
    topicTrail: [...normalized.topicTrail],
    journeyId: normalized.journeyId,
    fromTurnId: normalized.fromTurnId,
    selectedOptionId: normalized.selectedOptionId,
    action: normalized.action,
    branched: normalized.branched,
    expectedVersion: normalized.expectedVersion,
    idempotencyKey: request.idempotencyKey,
    payloadHash,
  };
  try {
    await db
      .prepare(
        `INSERT INTO research_requests
          (id, identity_id, kind, idempotency_key, payload_hash, request_json, status,
           started_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'researching', ?, ?)`,
      )
      .bind(
        requestId,
        viewer.identityId,
        request.kind,
        request.idempotencyKey,
        payloadHash,
        JSON.stringify(prepared),
        now,
        now,
      )
      .run();
  } catch (error) {
    console.error("Unable to reserve live research request", error);
    throw new RepositoryError(
      "IDEMPOTENCY_CONFLICT",
      "That foreground research request was already reserved.",
      409,
      true,
    );
  }
  return { type: "ready", prepared };
}

export async function commitLiveResearch(
  viewer: ViewerContext,
  prepared: PreparedLiveResearch,
  draft: LiveTurnDraft,
): Promise<JourneyDetail> {
  return prepared.kind === "create"
    ? commitLiveCreate(viewer, prepared, draft)
    : commitLiveAdvance(viewer, prepared, draft);
}

export async function markLiveResearchFailed(
  viewer: ViewerContext,
  requestId: string,
  error: unknown,
) {
  const repositoryError = error instanceof RepositoryError ? error : null;
  await getD1()
    .prepare(
      `UPDATE research_requests
       SET status = 'failed', error_code = ?, error_message = ?, completed_at = ?
       WHERE id = ? AND identity_id = ? AND status IN ('reserved', 'researching')`,
    )
    .bind(
      repositoryError?.code ?? "INTERNAL_ERROR",
      (repositoryError?.message ?? "Unexpected live research failure").slice(0, 500),
      Date.now(),
      requestId,
      viewer.identityId,
    )
    .run();
}

async function commitLiveCreate(
  viewer: ViewerContext,
  prepared: PreparedLiveResearch,
  draft: LiveTurnDraft,
) {
  const db = getD1();
  const now = Date.now();
  const journeyId = crypto.randomUUID();
  const turnId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO journeys
          (id, owner_identity_id, seed, title, performer_id, model_id, research_preset,
           answer_density, image_preference, current_turn_id, turn_count, source_count,
           last_action, status, version,
           created_at, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'created', 'active', 1, ?, ?
         WHERE EXISTS (
           SELECT 1 FROM research_requests
           WHERE id = ? AND identity_id = ? AND status = 'researching'
         )`,
      )
      .bind(
        journeyId,
        viewer.identityId,
        prepared.seed,
        titleFromSeed(prepared.seed),
        prepared.performerId,
        prepared.modelId,
        prepared.researchPreset,
        prepared.answerDensity,
        prepared.imagePreference,
        turnId,
        draft.sources.length,
        now,
        now,
        prepared.requestId,
        viewer.identityId,
      ),
    db
      .prepare(
        `INSERT INTO turns
          (id, journey_id, parent_turn_id, depth, question, status, answer, answer_json,
           transition, topic_label, research_summary, research_handoff_json, preferred_position,
           fixture_key, option_set_version, provider, model_id, prompt_version, performer_version,
           model_snapshot, answer_density, image_preference, created_at, ready_at)
         SELECT ?, ?, NULL, 0, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, NULL, 0,
                'openai', ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?)`,
      )
      .bind(
        turnId,
        journeyId,
        prepared.question,
        draft.answer,
        JSON.stringify({ blocks: draft.answerBlocks, media: draft.media }),
        draft.transition,
        draft.topicLabel,
        draft.researchSummary,
        JSON.stringify(draft.researchHandoff),
        draft.preferredPosition,
        prepared.modelId,
        PROMPT_VERSION,
        performerById(prepared.performerId).version,
        modelById(prepared.modelId).snapshot,
        prepared.answerDensity,
        prepared.imagePreference,
        now,
        now,
        journeyId,
        viewer.identityId,
      ),
    ...optionStatements(db, turnId, 0, draft),
    ...liveResearchStatements(db, prepared, draft, { journeyId, turnId, runId, now }),
    db
      .prepare(
        `UPDATE research_requests
         SET status = 'committed', provider_response_id = ?, result_journey_id = ?,
             result_turn_id = ?, input_tokens = ?, cached_input_tokens = ?, output_tokens = ?,
             reasoning_tokens = ?, total_tokens = ?, web_search_calls = ?, page_fetches = ?,
             estimated_cost_microusd = ?, completed_at = ?
         WHERE id = ? AND identity_id = ? AND status = 'researching'
           AND EXISTS (SELECT 1 FROM turns WHERE id = ? AND journey_id = ?)`,
      )
      .bind(
        draft.providerResponseId,
        journeyId,
        turnId,
        draft.usage.inputTokens,
        draft.usage.cachedInputTokens,
        draft.usage.outputTokens,
        draft.usage.reasoningTokens,
        draft.usage.totalTokens,
        draft.usage.webSearchCalls,
        draft.usage.pageFetches,
        Math.round(draft.usage.estimatedCostUsd * 1_000_000),
        now,
        prepared.requestId,
        viewer.identityId,
        turnId,
        journeyId,
      ),
    db
      .prepare(
        `INSERT INTO usage_events
          (id, identity_id, journey_id, turn_id, research_run_id, provider, model_id,
           input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
           web_search_calls, page_fetches, estimated_cost_microusd, rate_effective_at,
           provider_response_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'openai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        prepared.identityId,
        journeyId,
        turnId,
        runId,
        prepared.modelId,
        draft.usage.inputTokens,
        draft.usage.cachedInputTokens,
        draft.usage.outputTokens,
        draft.usage.reasoningTokens,
        draft.usage.webSearchCalls,
        draft.usage.pageFetches,
        Math.round(draft.usage.estimatedCostUsd * 1_000_000),
        draft.usage.rateEffectiveAt,
        draft.providerResponseId,
        now,
      ),
  ];
  const results = await db.batch(statements);
  assertChanged(results.at(-1));
  return getJourney(viewer, journeyId);
}

async function commitLiveAdvance(
  viewer: ViewerContext,
  prepared: PreparedLiveResearch,
  draft: LiveTurnDraft,
) {
  const journeyId = prepared.journeyId;
  const fromTurnId = prepared.fromTurnId;
  const selectedOptionId = prepared.selectedOptionId;
  const expectedVersion = prepared.expectedVersion;
  if (!journeyId || !fromTurnId || !selectedOptionId || expectedVersion === undefined) {
    throw new RepositoryError("INTERNAL_ERROR", "The live turn reservation was incomplete.", 500);
  }
  const db = getD1();
  const now = Date.now();
  const childId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const actionId = crypto.randomUUID();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE turn_options SET state = 'proposed'
         WHERE turn_id = ?
           AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?
             AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(fromTurnId, journeyId, viewer.identityId, expectedVersion),
    db
      .prepare(
        `UPDATE turn_options SET state = 'chosen'
         WHERE id = ? AND turn_id = ?
           AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?
             AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(selectedOptionId, fromTurnId, journeyId, viewer.identityId, expectedVersion),
    db
      .prepare(
        `INSERT INTO turns
          (id, journey_id, parent_turn_id, depth, question, status, answer, answer_json,
           transition, topic_label, research_summary, research_handoff_json, preferred_position,
           fixture_key, option_set_version, provider, model_id, prompt_version, performer_version,
           model_snapshot, answer_density, image_preference, created_at, ready_at)
         SELECT ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, NULL, 0,
                'openai', ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?
           AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        childId,
        journeyId,
        fromTurnId,
        prepared.depth,
        prepared.question,
        draft.answer,
        JSON.stringify({ blocks: draft.answerBlocks, media: draft.media }),
        draft.transition,
        draft.topicLabel,
        draft.researchSummary,
        JSON.stringify(draft.researchHandoff),
        draft.preferredPosition,
        prepared.modelId,
        PROMPT_VERSION,
        performerById(prepared.performerId).version,
        modelById(prepared.modelId).snapshot,
        prepared.answerDensity,
        prepared.imagePreference,
        now,
        now,
        journeyId,
        viewer.identityId,
        expectedVersion,
      ),
    ...optionStatements(db, childId, 0, draft, {
      journeyId,
      identityId: viewer.identityId,
      expectedVersion,
    }),
    ...conditionalLiveResearchStatements(
      db,
      prepared,
      draft,
      { journeyId, turnId: childId, runId, now },
      viewer.identityId,
      expectedVersion,
    ),
    db
      .prepare(
        `INSERT INTO turn_actions
          (id, journey_id, turn_id, kind, option_id, idempotency_key, payload_hash,
           result_turn_id, metadata_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?
           AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        actionId,
        journeyId,
        fromTurnId,
        prepared.action,
        selectedOptionId,
        prepared.idempotencyKey,
        prepared.payloadHash,
        childId,
        JSON.stringify({ branched: prepared.branched, live: true }),
        now,
        journeyId,
        viewer.identityId,
        expectedVersion,
      ),
    db
      .prepare(
        `INSERT INTO journey_edges
          (id, journey_id, from_turn_id, option_id, to_turn_id, action_id, kind, metadata_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM turn_actions WHERE id = ? AND journey_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        journeyId,
        fromTurnId,
        selectedOptionId,
        childId,
        actionId,
        prepared.action === "delegate" ? "delegated" : "chosen",
        JSON.stringify({ branched: prepared.branched }),
        now,
        actionId,
        journeyId,
      ),
    db
      .prepare(
        `INSERT INTO journey_edges
          (id, journey_id, from_turn_id, option_id, to_turn_id, action_id, kind, metadata_json, created_at)
         SELECT ?, ?, ?, option.id, NULL, ?, 'unchosen', ?, ?
         FROM turn_options AS option
         WHERE option.turn_id = ? AND option.id <> ?
           AND EXISTS (SELECT 1 FROM turn_actions WHERE id = ? AND journey_id = ?)
         ORDER BY option.position LIMIT 1`,
      )
      .bind(
        crypto.randomUUID(),
        journeyId,
        fromTurnId,
        actionId,
        JSON.stringify({ remainsOpen: true }),
        now,
        fromTurnId,
        selectedOptionId,
        actionId,
        journeyId,
      ),
    db
      .prepare(
        `UPDATE research_requests
         SET status = 'committed', provider_response_id = ?, result_journey_id = ?,
             result_turn_id = ?, input_tokens = ?, cached_input_tokens = ?, output_tokens = ?,
             reasoning_tokens = ?, total_tokens = ?, web_search_calls = ?, page_fetches = ?,
             estimated_cost_microusd = ?, completed_at = ?
         WHERE id = ? AND identity_id = ? AND status = 'researching'
           AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?
             AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        draft.providerResponseId,
        journeyId,
        childId,
        draft.usage.inputTokens,
        draft.usage.cachedInputTokens,
        draft.usage.outputTokens,
        draft.usage.reasoningTokens,
        draft.usage.totalTokens,
        draft.usage.webSearchCalls,
        draft.usage.pageFetches,
        Math.round(draft.usage.estimatedCostUsd * 1_000_000),
        now,
        prepared.requestId,
        viewer.identityId,
        journeyId,
        viewer.identityId,
        expectedVersion,
      ),
    db
      .prepare(
        `UPDATE journeys
         SET current_turn_id = ?, turn_count = turn_count + 1,
             source_count = source_count + ?, version = version + 1,
             model_id = ?, last_action = ?, status = 'active', updated_at = ?
         WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .bind(
        childId,
        draft.sources.length,
        prepared.modelId,
        prepared.branched ? "branch" : prepared.action,
        now,
        journeyId,
        viewer.identityId,
        expectedVersion,
      ),
    db
      .prepare(
        `INSERT INTO usage_events
          (id, identity_id, journey_id, turn_id, research_run_id, provider, model_id,
           input_tokens, cached_input_tokens, output_tokens, reasoning_tokens,
           web_search_calls, page_fetches, estimated_cost_microusd, rate_effective_at,
           provider_response_id, created_at)
         SELECT ?, ?, ?, ?, ?, 'openai', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?
           AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        crypto.randomUUID(),
        prepared.identityId,
        journeyId,
        childId,
        runId,
        prepared.modelId,
        draft.usage.inputTokens,
        draft.usage.cachedInputTokens,
        draft.usage.outputTokens,
        draft.usage.reasoningTokens,
        draft.usage.webSearchCalls,
        draft.usage.pageFetches,
        Math.round(draft.usage.estimatedCostUsd * 1_000_000),
        draft.usage.rateEffectiveAt,
        draft.providerResponseId,
        now,
        journeyId,
        viewer.identityId,
        expectedVersion + 1,
      ),
  ];
  const results = await db.batch(statements);
  assertChanged(results.at(-1));
  return getJourney(viewer, journeyId);
}

function liveResearchStatements(
  db: D1Database,
  prepared: PreparedLiveResearch,
  draft: LiveTurnDraft,
  ids: { journeyId: string; turnId: string; runId: string; now: number },
) {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO research_runs
          (id, journey_id, turn_id, provider, model_id, preset, status,
           provider_response_id, input_tokens, cached_input_tokens, output_tokens,
           reasoning_tokens, total_tokens, web_search_calls, page_fetches, latency_ms,
           estimated_cost_microusd, rate_effective_at, started_at, completed_at, created_at)
         VALUES (?, ?, ?, 'openai', ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        ids.runId,
        ids.journeyId,
        ids.turnId,
        prepared.modelId,
        prepared.researchPreset,
        draft.providerResponseId,
        draft.usage.inputTokens,
        draft.usage.cachedInputTokens,
        draft.usage.outputTokens,
        draft.usage.reasoningTokens,
        draft.usage.totalTokens,
        draft.usage.webSearchCalls,
        draft.usage.pageFetches,
        draft.usage.latencyMs,
        Math.round(draft.usage.estimatedCostUsd * 1_000_000),
        draft.usage.rateEffectiveAt,
        ids.now - draft.usage.latencyMs,
        ids.now,
        ids.now,
      ),
  ];
  appendEvidenceStatements(statements, db, draft, ids, false);
  return statements;
}

function conditionalLiveResearchStatements(
  db: D1Database,
  prepared: PreparedLiveResearch,
  draft: LiveTurnDraft,
  ids: { journeyId: string; turnId: string; runId: string; now: number },
  identityId: string,
  expectedVersion: number,
) {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO research_runs
          (id, journey_id, turn_id, provider, model_id, preset, status,
           provider_response_id, input_tokens, cached_input_tokens, output_tokens,
           reasoning_tokens, total_tokens, web_search_calls, page_fetches, latency_ms,
           estimated_cost_microusd, rate_effective_at, started_at, completed_at, created_at)
         SELECT ?, ?, ?, 'openai', ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ?
           AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        ids.runId,
        ids.journeyId,
        ids.turnId,
        prepared.modelId,
        prepared.researchPreset,
        draft.providerResponseId,
        draft.usage.inputTokens,
        draft.usage.cachedInputTokens,
        draft.usage.outputTokens,
        draft.usage.reasoningTokens,
        draft.usage.totalTokens,
        draft.usage.webSearchCalls,
        draft.usage.pageFetches,
        draft.usage.latencyMs,
        Math.round(draft.usage.estimatedCostUsd * 1_000_000),
        draft.usage.rateEffectiveAt,
        ids.now - draft.usage.latencyMs,
        ids.now,
        ids.now,
        ids.journeyId,
        identityId,
        expectedVersion,
      ),
  ];
  appendEvidenceStatements(statements, db, draft, ids, true);
  return statements;
}

function appendEvidenceStatements(
  statements: D1PreparedStatement[],
  db: D1Database,
  draft: LiveTurnDraft,
  ids: { journeyId: string; turnId: string; runId: string; now: number },
  conditional: boolean,
) {
  for (const source of draft.sources) {
    statements.push(
      conditional
        ? db
            .prepare(
              `INSERT INTO sources (id, canonical_url, title, publisher, retrieved_at)
               SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM turns WHERE id = ? AND journey_id = ?)
               ON CONFLICT(canonical_url) DO UPDATE SET title = excluded.title,
                 publisher = excluded.publisher, retrieved_at = excluded.retrieved_at`,
            )
            .bind(
              source.id,
              source.url,
              source.title,
              source.publisher,
              ids.now,
              ids.turnId,
              ids.journeyId,
            )
        : db
            .prepare(
              `INSERT INTO sources (id, canonical_url, title, publisher, retrieved_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(canonical_url) DO UPDATE SET title = excluded.title,
                 publisher = excluded.publisher, retrieved_at = excluded.retrieved_at`,
            )
            .bind(source.id, source.url, source.title, source.publisher, ids.now),
      db
        .prepare(
          `INSERT OR IGNORE INTO turn_sources (turn_id, source_id, relation)
           SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM turns WHERE id = ? AND journey_id = ?)`,
        )
        .bind(ids.turnId, source.id, source.relation, ids.turnId, ids.journeyId),
    );
  }
  for (const event of draft.researchEvents) {
    statements.push(
      db
        .prepare(
          `INSERT INTO research_events
            (id, research_run_id, sequence, kind, label, source_id, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM research_runs WHERE id = ?)`,
        )
        .bind(
          event.id,
          ids.runId,
          event.sequence,
          event.kind,
          event.label,
          event.sourceId,
          ids.now + event.sequence,
          ids.runId,
        ),
    );
  }
}

async function normalizeRequest(viewer: ViewerContext, request: LiveResearchRequest) {
  if (!request || typeof request !== "object") {
    throw new RepositoryError("BAD_REQUEST", "A live research configuration is required.", 400);
  }
  if (request.kind === "create") {
    const seed = normalizeSeed(request.seed);
    if (!PERFORMERS.some((performer) => performer.id === request.performerId)) {
      throw new RepositoryError("BAD_REQUEST", "Choose a supported performer.", 400);
    }
    if (
      !MODELS.some((model) => model.id === request.modelId && model.mode === "live")
    ) {
      throw new RepositoryError("BAD_REQUEST", "Choose the supported live research model.", 400);
    }
    if (!PRESETS.includes(request.researchPreset)) {
      throw new RepositoryError("BAD_REQUEST", "Choose a supported research preset.", 400);
    }
    if (!["brief", "balanced", "rich"].includes(request.answerDensity)) {
      throw new RepositoryError("BAD_REQUEST", "Choose a supported answer density.", 400);
    }
    if (!["avoid", "when-useful", "prefer"].includes(request.imagePreference)) {
      throw new RepositoryError("BAD_REQUEST", "Choose a supported factual-image preference.", 400);
    }
    const count = await getD1()
      .prepare(
        "SELECT COUNT(*) AS count FROM journeys WHERE owner_identity_id = ? AND deleted_at IS NULL",
      )
      .bind(viewer.identityId)
      .first<{ count: number }>();
    if ((count?.count ?? 0) >= viewer.journeyLimit) {
      throw new RepositoryError(
        "JOURNEY_LIMIT",
        `This library currently keeps up to ${viewer.journeyLimit} journeys.`,
        409,
      );
    }
    return {
      payload: {
        kind: request.kind,
        seed,
        performerId: request.performerId,
        modelId: request.modelId,
        researchPreset: request.researchPreset,
        answerDensity: request.answerDensity,
        imagePreference: request.imagePreference,
      },
      question: seed,
      seed,
      depth: 0,
      performerId: request.performerId,
      modelId: request.modelId,
      researchPreset: request.researchPreset,
      answerDensity: request.answerDensity,
      imagePreference: request.imagePreference,
      topicTrail: [],
      journeyId: undefined,
      fromTurnId: undefined,
      selectedOptionId: undefined,
      action: undefined,
      branched: false,
      expectedVersion: undefined,
    } as const;
  }
  if (request.kind !== "advance") {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported live research action.", 400);
  }
  assertId(request.journeyId, "journey");
  assertId(request.fromTurnId, "turn");
  if (request.action !== "choose" && request.action !== "delegate") {
    throw new RepositoryError("BAD_REQUEST", "Choose a path or delegate this turn.", 400);
  }
  if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1) {
    throw new RepositoryError("BAD_REQUEST", "A valid journey version is required.", 400);
  }
  const journey = await getJourney(viewer, request.journeyId);
  const modelId = request.modelId ?? journey.modelId;
  if (!MODELS.some((model) => model.id === modelId && model.mode === "live")) {
    throw new RepositoryError(
      "BAD_REQUEST",
      "This saved journey uses a model that is no longer available for live research.",
      400,
    );
  }
  if (journey.version !== request.expectedVersion) {
    throw new RepositoryError(
      "VERSION_CONFLICT",
      "This journey changed in another tab. Reload it before choosing again.",
      409,
      true,
    );
  }
  const fromTurn = journey.turns.find((turn) => turn.id === request.fromTurnId);
  if (!fromTurn || fromTurn.options.length !== 2) {
    throw new RepositoryError("BAD_REQUEST", "Choose from a valid saved turn.", 400);
  }
  const selected =
    request.action === "delegate"
      ? fromTurn.options.find((option) => option.position === fromTurn.preferredPosition)
      : fromTurn.options.find((option) => option.id === request.optionId);
  if (!selected || (fromTurn.id === journey.currentTurnId && selected.state !== "proposed")) {
    throw new RepositoryError("BAD_REQUEST", "Choose one of the two current paths.", 400);
  }
  const topicTrail = ancestorTopicTrail(journey, fromTurn.id);
  return {
    payload: {
      kind: request.kind,
      journeyId: journey.id,
      fromTurnId: fromTurn.id,
      action: request.action,
      modelId,
      optionId: selected.id,
      expectedVersion: request.expectedVersion,
    },
    question: selected.question,
    seed: journey.seed,
    depth: fromTurn.depth + 1,
    performerId: journey.performerId,
    modelId,
    researchPreset: journey.researchPreset,
    answerDensity: journey.answerDensity,
    imagePreference: journey.imagePreference,
    topicTrail,
    journeyId: journey.id,
    fromTurnId: fromTurn.id,
    selectedOptionId: selected.id,
    action: request.action,
    branched: fromTurn.id !== journey.currentTurnId,
    expectedVersion: request.expectedVersion,
  } as const;
}

function ancestorTopicTrail(journey: JourneyDetail, fromTurnId: string) {
  const byId = new Map(journey.turns.map((turn) => [turn.id, turn]));
  const chain: string[] = [];
  let current = byId.get(fromTurnId);
  while (current) {
    chain.push(current.topicLabel);
    current = current.parentTurnId ? byId.get(current.parentTurnId) : undefined;
  }
  return chain.reverse();
}

function assertChanged(result: D1Result<unknown> | undefined) {
  if (!result || (result.meta.changes ?? 0) === 0) {
    throw new RepositoryError(
      "VERSION_CONFLICT",
      "This journey changed before the researched turn could be committed. No partial turn was saved.",
      409,
      true,
    );
  }
}
