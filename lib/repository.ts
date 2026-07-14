import {
  MODELS,
  PERFORMERS,
  PROMPT_VERSION,
  modelById,
  performerById,
} from "./catalog";
import type {
  AdvanceJourneyRequest,
  CompareResult,
  CreateJourneyRequest,
  JourneyDetail,
  JourneyAction,
  JourneySummary,
  JourneyTurn,
  ModelId,
  PerformerId,
  ResearchPreset,
  Source,
  TurnOption,
} from "./contracts";
import { buildFixtureTurn, stableKey, type FixtureTurnDraft } from "./fixtures";
import { getD1 } from "../db";
import type { ViewerContext } from "./viewer";
import { RepositoryError } from "./errors";
import {
  assertId,
  assertIdempotencyKey,
  hashPayload,
  normalizeSeed,
  titleFromSeed,
} from "./request";
import { optionStatements } from "./turn-options";

type JourneyRow = {
  id: string;
  seed: string;
  title: string;
  performer_id: PerformerId;
  model_id: ModelId;
  research_preset: ResearchPreset;
  answer_density: JourneySummary["answerDensity"];
  image_preference: JourneySummary["imagePreference"];
  pinned: number;
  hidden: number;
  current_turn_id: string;
  turn_count: number;
  source_count: number;
  status: "active" | "paused";
  version: number;
  updated_at: number;
  open_branch_count: number;
};

type TurnRow = {
  id: string;
  parent_turn_id: string | null;
  depth: number;
  question: string;
  answer: string;
  answer_json: string | null;
  transition: string;
  topic_label: string;
  research_summary: string;
  research_handoff_json: string | null;
  preferred_position: number;
  option_set_version: number;
  run_provider: string | null;
  turn_provider: string | null;
  turn_model_id: ModelId | null;
  prompt_version: string | null;
  performer_version: string | null;
  model_snapshot: string | null;
  turn_answer_density: JourneySummary["answerDensity"] | null;
  turn_image_preference: JourneySummary["imagePreference"] | null;
  provider_response_id: string | null;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_tokens: number;
  total_tokens: number;
  web_search_calls: number;
  page_fetches: number;
  latency_ms: number;
  estimated_cost_microusd: number;
  rate_effective_at: string;
  created_at: number;
};

type OptionRow = {
  id: string;
  turn_id: string;
  position: number;
  question: string;
  angle: string;
  state: TurnOption["state"];
};

type SourceRow = {
  turn_id: string;
  id: string;
  title: string;
  publisher: string;
  canonical_url: string;
  relation: Source["relation"];
  published_at: string | null;
  retrieved_at: number;
  warning: string | null;
  license_note: string | null;
};

type ActionRow = {
  id: string;
  turn_id: string;
  kind: JourneyAction["kind"];
  option_id: string | null;
  result_turn_id: string | null;
  metadata_json: string | null;
  created_at: number;
};

type EventRow = {
  turn_id: string;
  id: string;
  sequence: number;
  kind: JourneyTurn["researchEvents"][number]["kind"];
  label: string;
  source_id: string | null;
};

const PRESETS: ResearchPreset[] = ["spark", "standard", "deep"];

export async function createJourney(
  viewer: ViewerContext,
  request: CreateJourneyRequest,
): Promise<JourneyDetail> {
  validateCreateRequest(request);
  if (String(request.modelId) !== "fixture-terra") {
    throw new RepositoryError(
      "BAD_REQUEST",
      "Live models must use the foreground research route.",
      400,
    );
  }
  const db = getD1();
  const seed = normalizeSeed(request.seed);
  await db
    .prepare("DELETE FROM idempotency_keys WHERE identity_id = ? AND expires_at <= ?")
    .bind(viewer.identityId, Date.now())
    .run();
  const payloadHash = await hashPayload({
    seed,
    performerId: request.performerId,
    modelId: request.modelId,
    researchPreset: request.researchPreset,
    answerDensity: request.answerDensity,
    imagePreference: request.imagePreference,
  });
  const prior = await db
    .prepare(
      "SELECT payload_hash, response_id FROM idempotency_keys WHERE identity_id = ? AND route = 'create-journey' AND key = ? AND expires_at > ? LIMIT 1",
    )
    .bind(viewer.identityId, request.idempotencyKey, Date.now())
    .first<{ payload_hash: string; response_id: string }>();
  if (prior) {
    if (prior.payload_hash !== payloadHash) {
      throw new RepositoryError(
        "IDEMPOTENCY_CONFLICT",
        "That request key was already used for a different journey.",
        409,
      );
    }
    return getJourney(viewer, prior.response_id);
  }

  const count = await db
    .prepare(
      "SELECT COUNT(*) AS count FROM journeys WHERE owner_identity_id = ? AND deleted_at IS NULL",
    )
    .bind(viewer.identityId)
    .first<{ count: number }>();
  if ((count?.count ?? 0) >= viewer.journeyLimit) {
    throw new RepositoryError(
      "JOURNEY_LIMIT",
      viewer.mode === "guest"
        ? `Guest mode keeps up to ${viewer.journeyLimit} journeys. Sign in with ChatGPT to keep more.`
        : `Your library currently keeps up to ${viewer.journeyLimit} journeys.`,
      409,
    );
  }

  const now = Date.now();
  const journeyId = crypto.randomUUID();
  const turnId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const draft = buildFixtureTurn({
    question: seed,
    depth: 0,
    performerId: request.performerId,
  });
  const statements = [
    db
      .prepare(
        `INSERT INTO journeys
          (id, owner_identity_id, seed, title, performer_id, model_id, research_preset,
           answer_density, image_preference, current_turn_id, turn_count, source_count,
           last_action, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'created', 'active', 1, ?, ?)`,
      )
      .bind(
        journeyId,
        viewer.identityId,
        seed,
        titleFromSeed(seed),
        request.performerId,
        request.modelId,
        request.researchPreset,
        request.answerDensity,
        request.imagePreference,
        turnId,
        draft.sources.length,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO turns
          (id, journey_id, parent_turn_id, depth, question, status, answer, answer_json,
           transition, topic_label, research_summary, research_handoff_json, preferred_position,
           fixture_key, option_set_version, provider, model_id, prompt_version,
           performer_version, model_snapshot, answer_density, image_preference, created_at, ready_at)
         VALUES (?, ?, NULL, 0, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'fixture', ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        turnId,
        journeyId,
        seed,
        draft.answer,
        JSON.stringify({ blocks: draft.answerBlocks, media: draft.media }),
        draft.transition,
        draft.topicLabel,
        draft.researchSummary,
        JSON.stringify(draft.researchHandoff),
        draft.preferredPosition,
        draft.fixtureKey,
        request.modelId,
        PROMPT_VERSION,
        performerById(request.performerId).version,
        modelById(request.modelId).snapshot,
        request.answerDensity,
        request.imagePreference,
        now,
        now,
      ),
    ...optionStatements(db, turnId, 0, draft),
    ...researchStatements(
      db,
      { journeyId, turnId, runId, modelId: request.modelId, preset: request.researchPreset },
      draft,
      now,
    ),
    db
      .prepare(
        "INSERT INTO idempotency_keys (id, identity_id, route, key, payload_hash, response_id, created_at, expires_at) VALUES (?, ?, 'create-journey', ?, ?, ?, ?, ?)",
      )
      .bind(
        crypto.randomUUID(),
        viewer.identityId,
        request.idempotencyKey,
        payloadHash,
        journeyId,
        now,
        now + 86_400_000,
      ),
  ];

  try {
    await db.batch(statements);
  } catch (error) {
    const raced = await db
      .prepare(
        "SELECT payload_hash, response_id FROM idempotency_keys WHERE identity_id = ? AND route = 'create-journey' AND key = ? LIMIT 1",
      )
      .bind(viewer.identityId, request.idempotencyKey)
      .first<{ payload_hash: string; response_id: string }>();
    if (raced?.payload_hash === payloadHash) return getJourney(viewer, raced.response_id);
    throw error;
  }
  return getJourney(viewer, journeyId);
}

export async function listJourneys(viewer: ViewerContext): Promise<JourneySummary[]> {
  const db = getD1();
  const journeys = await db
    .prepare(
      `SELECT id, seed, title, performer_id, model_id, research_preset, answer_density,
              image_preference, pinned, hidden, current_turn_id, turn_count, source_count,
              status, version, updated_at,
              (SELECT COUNT(*) FROM turn_options o JOIN turns t ON t.id = o.turn_id
               WHERE t.journey_id = journeys.id AND o.state = 'proposed') AS open_branch_count
       FROM journeys
       WHERE owner_identity_id = ? AND deleted_at IS NULL
       ORDER BY updated_at DESC`,
    )
    .bind(viewer.identityId)
    .all<JourneyRow>();
  if (!journeys.results.length) return [];

  const placeholders = journeys.results.map(() => "?").join(",");
  const topics = await db
    .prepare(
      `SELECT journey_id, topic_label FROM turns
       WHERE journey_id IN (${placeholders}) AND status = 'ready'
       ORDER BY created_at`,
    )
    .bind(...journeys.results.map((journey) => journey.id))
    .all<{ journey_id: string; topic_label: string }>();
  const byJourney = new Map<string, string[]>();
  for (const topic of topics.results) {
    const values = byJourney.get(topic.journey_id) ?? [];
    if (topic.topic_label && !values.includes(topic.topic_label)) values.push(topic.topic_label);
    byJourney.set(topic.journey_id, values);
  }
  return journeys.results.map((journey) => summaryFromRow(journey, byJourney.get(journey.id) ?? []));
}

export async function getJourney(
  viewer: ViewerContext,
  journeyId: string,
): Promise<JourneyDetail> {
  assertId(journeyId, "journey");
  const db = getD1();
  const journey = await db
    .prepare(
      `SELECT id, seed, title, performer_id, model_id, research_preset, answer_density,
              image_preference, pinned, hidden, current_turn_id, turn_count, source_count,
              status, version, updated_at,
              (SELECT COUNT(*) FROM turn_options o JOIN turns t ON t.id = o.turn_id
               WHERE t.journey_id = journeys.id AND o.state = 'proposed') AS open_branch_count
       FROM journeys
       WHERE id = ? AND owner_identity_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(journeyId, viewer.identityId)
    .first<JourneyRow>();
  if (!journey) {
    throw new RepositoryError("NOT_FOUND", "That saved journey was not found.", 404);
  }

  const [turnsResult, optionsResult, sourcesResult, eventsResult, actionsResult] = await Promise.all([
      db
        .prepare(
          `SELECT t.id, t.parent_turn_id, t.depth, t.question, t.answer, t.answer_json,
                  t.transition, t.topic_label, t.research_summary, t.research_handoff_json,
                  t.preferred_position, t.option_set_version, t.created_at,
                  t.provider AS turn_provider, t.model_id AS turn_model_id,
                  t.prompt_version, t.performer_version, t.model_snapshot,
                  t.answer_density AS turn_answer_density,
                  t.image_preference AS turn_image_preference, r.provider AS run_provider,
                  r.provider_response_id, COALESCE(r.input_tokens, 0) AS input_tokens,
                  COALESCE(r.cached_input_tokens, 0) AS cached_input_tokens,
                  COALESCE(r.output_tokens, 0) AS output_tokens,
                  COALESCE(r.reasoning_tokens, 0) AS reasoning_tokens,
                  COALESCE(r.total_tokens, 0) AS total_tokens,
                  COALESCE(r.web_search_calls, 0) AS web_search_calls,
                  COALESCE(r.page_fetches, 0) AS page_fetches,
                  COALESCE(r.latency_ms, 0) AS latency_ms,
                  COALESCE(r.estimated_cost_microusd, 0) AS estimated_cost_microusd,
                  COALESCE(r.rate_effective_at, '2026-07-13') AS rate_effective_at
           FROM turns t
           LEFT JOIN research_runs r ON r.turn_id = t.id
           WHERE t.journey_id = ? AND t.status = 'ready'
           ORDER BY t.created_at, t.depth`,
        )
        .bind(journeyId)
        .all<TurnRow>(),
      db
        .prepare(
          `SELECT o.id, o.turn_id, o.position, o.question, o.angle, o.state
           FROM turn_options o
           JOIN turns t ON t.id = o.turn_id AND t.option_set_version = o.set_version
           WHERE t.journey_id = ?
           ORDER BY t.created_at, o.position`,
        )
        .bind(journeyId)
        .all<OptionRow>(),
      db
        .prepare(
          `SELECT ts.turn_id, s.id, s.title, s.publisher, s.canonical_url, ts.relation,
                  s.published_at, s.retrieved_at, s.warning, s.license_note
           FROM turn_sources ts
           JOIN turns t ON t.id = ts.turn_id
           JOIN sources s ON s.id = ts.source_id
           WHERE t.journey_id = ?
           ORDER BY t.created_at, s.title`,
        )
        .bind(journeyId)
        .all<SourceRow>(),
      db
        .prepare(
          `SELECT r.turn_id, e.id, e.sequence, e.kind, e.label, e.source_id
           FROM research_events e
           JOIN research_runs r ON r.id = e.research_run_id
           WHERE r.journey_id = ?
           ORDER BY r.created_at, e.sequence`,
        )
        .bind(journeyId)
        .all<EventRow>(),
      db
        .prepare(
          `SELECT id, turn_id, kind, option_id, result_turn_id, metadata_json, created_at
           FROM turn_actions WHERE journey_id = ? ORDER BY created_at`,
        )
        .bind(journeyId)
        .all<ActionRow>(),
    ]);

  const options = groupBy(optionsResult.results, "turn_id");
  const sources = groupBy(sourcesResult.results, "turn_id");
  const events = groupBy(eventsResult.results, "turn_id");
  const topicLabels: string[] = [];
  const turns: JourneyTurn[] = turnsResult.results.map((turn) => {
    if (turn.topic_label && !topicLabels.includes(turn.topic_label)) topicLabels.push(turn.topic_label);
    const answerPayload = parseAnswerPayload(turn.answer_json, turn.answer ?? "");
    return {
      id: turn.id,
      parentTurnId: turn.parent_turn_id,
      depth: turn.depth,
      question: turn.question,
      answer: turn.answer ?? "",
      answerBlocks: answerPayload.blocks,
      media: answerPayload.media,
      transition: turn.transition ?? "",
      topicLabel: turn.topic_label ?? "open question",
      researchSummary: turn.research_summary ?? "",
      researchHandoff: parseResearchHandoff(turn.research_handoff_json),
      preferredPosition: turn.preferred_position === 1 ? 1 : 0,
      optionSetVersion: turn.option_set_version,
      options: (options.get(turn.id) ?? []).map((option) => ({
        id: option.id,
        position: option.position === 1 ? 1 : 0,
        question: option.question,
        angle: option.angle,
        state: option.state,
      })),
      sources: (sources.get(turn.id) ?? []).map((source) => ({
        id: source.id,
        title: source.title,
        publisher: source.publisher,
        url: source.canonical_url,
        relation: source.relation,
        publishedAt: source.published_at,
        retrievedAt: source.retrieved_at,
        warning: source.warning,
        licenseNote: source.license_note,
      })),
      researchEvents: (events.get(turn.id) ?? []).map((event) => ({
        id: event.id,
        sequence: event.sequence,
        kind: event.kind,
        label: event.label,
        sourceId: event.source_id,
      })),
      research: {
        mode: turn.run_provider === "openai" ? "live" : "fixture",
        providerResponseId: turn.provider_response_id,
        usage: {
          inputTokens: turn.input_tokens,
          cachedInputTokens: turn.cached_input_tokens,
          outputTokens: turn.output_tokens,
          reasoningTokens: turn.reasoning_tokens,
          totalTokens: turn.total_tokens,
          webSearchCalls: turn.web_search_calls,
          pageFetches: turn.page_fetches,
          latencyMs: turn.latency_ms,
          estimatedCostUsd: turn.estimated_cost_microusd / 1_000_000,
          rateEffectiveAt: turn.rate_effective_at,
        },
      },
      metadata: {
        performerId: journey.performer_id,
        performerVersion: turn.performer_version ?? performerById(journey.performer_id).version,
        provider: turn.turn_provider ?? (turn.run_provider === "openai" ? "OpenAI" : "WonderDrive"),
        modelId: turn.turn_model_id ?? journey.model_id,
        modelSnapshot: turn.model_snapshot ?? modelById(journey.model_id).snapshot,
        researchPreset: journey.research_preset,
        answerDensity: turn.turn_answer_density ?? journey.answer_density,
        imagePreference: turn.turn_image_preference ?? journey.image_preference,
        promptVersion: turn.prompt_version ?? PROMPT_VERSION,
        researchedAt: turn.created_at,
      },
      createdAt: turn.created_at,
    };
  });

  return {
    ...summaryFromRow(journey, topicLabels),
    status: journey.status,
    turns,
    actions: actionsResult.results.map((action) => {
      const metadata = safeJsonObject(action.metadata_json);
      return {
        id: action.id,
        turnId: action.turn_id,
        kind: action.kind,
        optionId: action.option_id,
        resultTurnId: action.result_turn_id,
        reason: typeof metadata.reason === "string" ? metadata.reason : null,
        adventure: typeof metadata.adventure === "number" ? metadata.adventure : null,
        createdAt: action.created_at,
      };
    }),
  };
}

export async function listRejectedQuestions(
  viewer: ViewerContext,
  journeyId: string,
): Promise<string[]> {
  await getJourney(viewer, journeyId);
  const result = await getD1()
    .prepare(
      `SELECT o.question
       FROM turn_options o
       JOIN turns t ON t.id = o.turn_id
       WHERE t.journey_id = ? AND o.state = 'rejected'
       ORDER BY t.created_at, o.set_version, o.position`,
    )
    .bind(journeyId)
    .all<{ question: string }>();
  return result.results.map((item) => item.question);
}

export async function advanceJourney(
  viewer: ViewerContext,
  journeyId: string,
  request: AdvanceJourneyRequest,
  liveRedraw?: (context: { journey: JourneyDetail; turn: JourneyTurn }) => Promise<{
    preferredPosition: 0 | 1;
    options: Array<{ question: string; angle: string }>;
  }>,
): Promise<JourneyDetail> {
  validateAdvanceRequest(request);
  const db = getD1();
  const payloadHash = await hashPayload({
    fromTurnId: request.fromTurnId,
    action: request.action,
    optionId: request.optionId ?? null,
    adventure: request.adventure ?? null,
    reason: request.reason?.trim() || null,
    expectedVersion: request.expectedVersion,
  });
  const prior = await db
    .prepare(
      "SELECT payload_hash FROM turn_actions WHERE journey_id = ? AND idempotency_key = ? LIMIT 1",
    )
    .bind(journeyId, request.idempotencyKey)
    .first<{ payload_hash: string }>();
  if (prior) {
    if (prior.payload_hash !== payloadHash) {
      throw new RepositoryError(
        "IDEMPOTENCY_CONFLICT",
        "That action key was already used for a different choice.",
        409,
      );
    }
    return getJourney(viewer, journeyId);
  }

  const journey = await getJourney(viewer, journeyId);
  if (String(journey.modelId) !== "fixture-terra" && request.action !== "reject") {
    throw new RepositoryError(
      "BAD_REQUEST",
      "Live journey choices must use the foreground research route.",
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
  if (!fromTurn) {
    throw new RepositoryError("BAD_REQUEST", "The selected turn is not part of this journey.", 400);
  }
  if (fromTurn.options.length !== 2) {
    throw new RepositoryError("INTERNAL_ERROR", "The turn does not have exactly two paths.", 500);
  }
  const now = Date.now();

  if (request.action === "reject") {
    const setVersion = fromTurn.optionSetVersion + 1;
    const actionId = crypto.randomUUID();
    const draft = String(journey.modelId) === "fixture-terra"
      ? buildFixtureTurn({
          question: fromTurn.question,
          depth: fromTurn.depth,
          performerId: journey.performerId,
          rejectionCount: setVersion,
          adventure: request.adventure ?? 50,
        })
      : await liveRedraw?.({ journey, turn: fromTurn });
    if (!draft || draft.options.length !== 2) {
      throw new RepositoryError(
        "RESEARCH_VALIDATION_FAILED",
        "Live replacement questions must be generated before committing a redraw.",
        500,
      );
    }
    const statements = [
      db
        .prepare(
          `UPDATE turn_options SET state = 'rejected'
           WHERE turn_id = ? AND set_version = ?
             AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
        )
        .bind(
          fromTurn.id,
          fromTurn.optionSetVersion,
          journeyId,
          viewer.identityId,
          request.expectedVersion,
        ),
      ...optionStatements(db, fromTurn.id, setVersion, draft, {
        journeyId,
        identityId: viewer.identityId,
        expectedVersion: request.expectedVersion,
      }),
      db
        .prepare(
          `UPDATE turns SET option_set_version = ?, preferred_position = ?
           WHERE id = ? AND journey_id = ?
             AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
        )
        .bind(
          setVersion,
          draft.preferredPosition,
          fromTurn.id,
          journeyId,
          journeyId,
          viewer.identityId,
          request.expectedVersion,
        ),
      db
        .prepare(
          `INSERT INTO turn_actions
            (id, journey_id, turn_id, kind, option_id, idempotency_key, payload_hash, result_turn_id, metadata_json, created_at)
           SELECT ?, ?, ?, 'reject', NULL, ?, ?, NULL, ?, ?
           WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
        )
        .bind(
          actionId,
          journeyId,
          fromTurn.id,
          request.idempotencyKey,
          payloadHash,
          JSON.stringify({
            adventure: request.adventure ?? 50,
            reason: request.reason?.trim() || null,
            setVersion,
          }),
          now,
          journeyId,
          viewer.identityId,
          request.expectedVersion,
        ),
      ...fromTurn.options.map((option) =>
        db
          .prepare(
            `INSERT INTO journey_edges
              (id, journey_id, from_turn_id, option_id, to_turn_id, action_id, kind, metadata_json, created_at)
             SELECT ?, ?, ?, ?, NULL, ?, 'rejected', ?, ?
             WHERE EXISTS (SELECT 1 FROM turn_actions WHERE id = ? AND journey_id = ?)`,
          )
          .bind(
            crypto.randomUUID(),
            journeyId,
            fromTurn.id,
            option.id,
            actionId,
            JSON.stringify({ setVersion, reason: request.reason?.trim() || null }),
            now,
            actionId,
            journeyId,
          ),
      ),
      db
        .prepare(
          `UPDATE journeys
           SET version = version + 1, last_action = 'reject', updated_at = ?
           WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL`,
        )
        .bind(now, journeyId, viewer.identityId, request.expectedVersion),
    ];
    const results = await db.batch(statements);
    assertMutationChanged(results.at(-1));
    return getJourney(viewer, journeyId);
  }

  const selected =
    request.action === "delegate"
      ? fromTurn.options.find((option) => option.position === fromTurn.preferredPosition)
      : fromTurn.options.find((option) => option.id === request.optionId);
  if (!selected || selected.state !== "proposed") {
    throw new RepositoryError("BAD_REQUEST", "Choose one of the two current paths.", 400);
  }

  const childId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const actionId = crypto.randomUUID();
  const sibling = fromTurn.options.find((option) => option.id !== selected.id)!;
  const childDepth = fromTurn.depth + 1;
  const draft = buildFixtureTurn({
    question: selected.question,
    depth: childDepth,
    performerId: journey.performerId,
  });
  const branched = fromTurn.id !== journey.currentTurnId;
  const statements = [
    db
      .prepare(
        `UPDATE turn_options SET state = 'proposed'
         WHERE turn_id = ? AND set_version = ?
           AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        fromTurn.id,
        fromTurn.optionSetVersion,
        journeyId,
        viewer.identityId,
        request.expectedVersion,
      ),
    db
      .prepare(
        `UPDATE turn_options SET state = 'chosen'
         WHERE id = ? AND turn_id = ?
           AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(selected.id, fromTurn.id, journeyId, viewer.identityId, request.expectedVersion),
    db
      .prepare(
        `INSERT INTO turns
          (id, journey_id, parent_turn_id, depth, question, status, answer, answer_json,
           transition, topic_label, research_summary, research_handoff_json, preferred_position,
           fixture_key, option_set_version, provider, model_id, prompt_version, performer_version,
           model_snapshot, answer_density, image_preference, created_at, ready_at)
         SELECT ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'fixture', ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        childId,
        journeyId,
        fromTurn.id,
        childDepth,
        selected.question,
        draft.answer,
        JSON.stringify({ blocks: draft.answerBlocks, media: draft.media }),
        draft.transition,
        draft.topicLabel,
        draft.researchSummary,
        JSON.stringify(draft.researchHandoff),
        draft.preferredPosition,
        draft.fixtureKey,
        journey.modelId,
        PROMPT_VERSION,
        performerById(journey.performerId).version,
        modelById(journey.modelId).snapshot,
        journey.answerDensity,
        journey.imagePreference,
        now,
        now,
        journeyId,
        viewer.identityId,
        request.expectedVersion,
      ),
    ...optionStatements(db, childId, 0, draft, {
      journeyId,
      identityId: viewer.identityId,
      expectedVersion: request.expectedVersion,
    }),
    ...conditionalResearchStatements(
      db,
      {
        journeyId,
        turnId: childId,
        runId,
        modelId: journey.modelId,
        preset: journey.researchPreset,
      },
      draft,
      now,
      viewer.identityId,
      request.expectedVersion,
    ),
    db
      .prepare(
        `INSERT INTO turn_actions
          (id, journey_id, turn_id, kind, option_id, idempotency_key, payload_hash, result_turn_id, metadata_json, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        actionId,
        journeyId,
        fromTurn.id,
        request.action,
        selected.id,
        request.idempotencyKey,
        payloadHash,
        childId,
        JSON.stringify({ branched, delegated: request.action === "delegate" }),
        now,
        journeyId,
        viewer.identityId,
        request.expectedVersion,
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
        fromTurn.id,
        selected.id,
        childId,
        actionId,
        request.action === "delegate" ? "delegated" : "chosen",
        JSON.stringify({ branched }),
        now,
        actionId,
        journeyId,
      ),
    db
      .prepare(
        `INSERT INTO journey_edges
          (id, journey_id, from_turn_id, option_id, to_turn_id, action_id, kind, metadata_json, created_at)
         SELECT ?, ?, ?, ?, NULL, ?, 'unchosen', ?, ?
         WHERE EXISTS (SELECT 1 FROM turn_actions WHERE id = ? AND journey_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        journeyId,
        fromTurn.id,
        sibling.id,
        actionId,
        JSON.stringify({ remainsOpen: true }),
        now,
        actionId,
        journeyId,
      ),
    db
      .prepare(
        `UPDATE journeys
         SET current_turn_id = ?, turn_count = turn_count + 1,
             source_count = source_count + ?, version = version + 1,
             last_action = ?, status = 'active', updated_at = ?
         WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL`,
      )
      .bind(
        childId,
        draft.sources.length,
        branched ? "branch" : request.action,
        now,
        journeyId,
        viewer.identityId,
        request.expectedVersion,
      ),
  ];
  const results = await db.batch(statements);
  assertMutationChanged(results.at(-1));
  return getJourney(viewer, journeyId);
}

export async function deleteJourney(viewer: ViewerContext, journeyId: string): Promise<{ id: string }> {
  assertId(journeyId, "journey");
  const result = await getD1()
    .prepare(
      `UPDATE journeys SET status = 'deleted', deleted_at = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND owner_identity_id = ? AND deleted_at IS NULL`,
    )
    .bind(Date.now(), Date.now(), journeyId, viewer.identityId)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new RepositoryError("NOT_FOUND", "That saved journey was not found.", 404);
  }
  return { id: journeyId };
}

export async function compareJourneys(
  viewer: ViewerContext,
  leftId: string,
  rightId: string,
): Promise<CompareResult> {
  if (leftId === rightId) {
    throw new RepositoryError("BAD_REQUEST", "Choose two different journeys to compare.", 400);
  }
  const [leftDetail, rightDetail] = await Promise.all([
    getJourney(viewer, leftId),
    getJourney(viewer, rightId),
  ]);
  const leftSummary = summaryFromDetail(leftDetail);
  const rightSummary = summaryFromDetail(rightDetail);
  const decorate = (detail: JourneyDetail) => ({
    ...summaryFromDetail(detail),
    performerName: performerById(detail.performerId).name,
    modelName: modelById(detail.modelId).name,
    actionCount: detail.actions.length,
    rejectedCount: detail.actions.filter((action) => action.kind === "reject").length,
    delegatedCount: detail.actions.filter((action) => action.kind === "delegate").length,
    totalEstimatedCostUsd: detail.turns.reduce(
      (total, turn) => total + turn.research.usage.estimatedCostUsd,
      0,
    ),
    timeline: detail.turns.map((turn) => ({
      turnId: turn.id,
      question: turn.question,
      topicLabel: turn.topicLabel,
      transition: turn.transition,
      researchedAt: turn.metadata.researchedAt,
      sourceCount: turn.sources.length,
    })),
  });
  const left = decorate(leftDetail);
  const right = decorate(rightDetail);
  const sharedTopics = leftSummary.topicLabels.filter((topic) => rightSummary.topicLabels.includes(topic));
  const leftOnlyTopics = leftSummary.topicLabels.filter((topic) => !rightSummary.topicLabels.includes(topic));
  const rightOnlyTopics = rightSummary.topicLabels.filter((topic) => !leftSummary.topicLabels.includes(topic));
  const observations = [
    sharedTopics.length
      ? `Both journeys touched ${formatList(sharedTopics)}.`
      : "The journeys did not land on the same fixture topic.",
    left.performerId === right.performerId
      ? "They used the same performer, so the path—not the persona—is the clearest visible difference."
      : "They used different performers, so both path and persona shape the contrast.",
    left.turnCount === right.turnCount
      ? `Both contain ${left.turnCount} committed ${left.turnCount === 1 ? "turn" : "turns"}.`
      : `${left.title} contains ${left.turnCount} turns; ${right.title} contains ${right.turnCount}.`,
  ];
  return {
    left,
    right,
    sharedTopics,
    leftOnlyTopics,
    rightOnlyTopics,
    observations,
    confounders: [
      "Live-web evidence can change between research dates.",
      "Audience choices and rejected paths change the context of later turns.",
      "Model output is stochastic; this view is descriptive, not a winner ranking.",
      left.seed === right.seed ? "Both journeys began from the same seed." : "The starting seeds differ.",
    ],
  };
}

function researchStatements(
  db: D1Database,
  input: {
    journeyId: string;
    turnId: string;
    runId: string;
    modelId: ModelId;
    preset: ResearchPreset;
  },
  draft: FixtureTurnDraft,
  now: number,
) {
  const statements = [
    db
      .prepare(
        `INSERT INTO research_runs
          (id, journey_id, turn_id, provider, model_id, preset, status, started_at, completed_at, created_at)
         VALUES (?, ?, ?, 'fixture', ?, ?, 'ready', ?, ?, ?)`,
      )
      .bind(input.runId, input.journeyId, input.turnId, input.modelId, input.preset, now, now, now),
  ];
  for (const source of draft.sources) {
    const sourceId = stableKey(source.url);
    statements.push(
      db
        .prepare(
          `INSERT INTO sources (id, canonical_url, title, publisher, retrieved_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(canonical_url) DO UPDATE SET title = excluded.title, publisher = excluded.publisher, retrieved_at = excluded.retrieved_at`,
        )
        .bind(sourceId, source.url, source.title, source.publisher, now),
      db
        .prepare(
          "INSERT OR IGNORE INTO turn_sources (turn_id, source_id, relation) VALUES (?, ?, 'cited')",
        )
        .bind(input.turnId, sourceId),
    );
  }
  draft.researchEvents.forEach((event) => {
    const source = event.kind === "source" ? draft.sources[event.sequence === 1 ? 0 : 1] : null;
    statements.push(
      db
        .prepare(
          `INSERT INTO research_events
            (id, research_run_id, sequence, kind, label, source_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.runId,
          event.sequence,
          event.kind,
          event.label,
          source ? stableKey(source.url) : null,
          now + event.sequence,
        ),
    );
  });
  return statements;
}

function conditionalResearchStatements(
  db: D1Database,
  input: {
    journeyId: string;
    turnId: string;
    runId: string;
    modelId: ModelId;
    preset: ResearchPreset;
  },
  draft: FixtureTurnDraft,
  now: number,
  identityId: string,
  expectedVersion: number,
) {
  const statements = [
    db
      .prepare(
        `INSERT INTO research_runs
          (id, journey_id, turn_id, provider, model_id, preset, status, started_at, completed_at, created_at)
         SELECT ?, ?, ?, 'fixture', ?, ?, 'ready', ?, ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        input.runId,
        input.journeyId,
        input.turnId,
        input.modelId,
        input.preset,
        now,
        now,
        now,
        input.journeyId,
        identityId,
        expectedVersion,
      ),
  ];
  for (const source of draft.sources) {
    const sourceId = stableKey(source.url);
    statements.push(
      db
        .prepare(
          `INSERT INTO sources (id, canonical_url, title, publisher, retrieved_at)
           SELECT ?, ?, ?, ?, ?
           WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)
           ON CONFLICT(canonical_url) DO UPDATE SET title = excluded.title, publisher = excluded.publisher, retrieved_at = excluded.retrieved_at`,
        )
        .bind(
          sourceId,
          source.url,
          source.title,
          source.publisher,
          now,
          input.journeyId,
          identityId,
          expectedVersion,
        ),
      db
        .prepare(
          `INSERT OR IGNORE INTO turn_sources (turn_id, source_id, relation)
           SELECT ?, ?, 'cited' WHERE EXISTS (SELECT 1 FROM turns WHERE id = ? AND journey_id = ?)`,
        )
        .bind(input.turnId, sourceId, input.turnId, input.journeyId),
    );
  }
  draft.researchEvents.forEach((event) => {
    const source = event.kind === "source" ? draft.sources[event.sequence === 1 ? 0 : 1] : null;
    statements.push(
      db
        .prepare(
          `INSERT INTO research_events
            (id, research_run_id, sequence, kind, label, source_id, created_at)
           SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM research_runs WHERE id = ?)`,
        )
        .bind(
          crypto.randomUUID(),
          input.runId,
          event.sequence,
          event.kind,
          event.label,
          source ? stableKey(source.url) : null,
          now + event.sequence,
          input.runId,
        ),
    );
  });
  return statements;
}

function summaryFromRow(row: JourneyRow, topicLabels: string[]): JourneySummary {
  return {
    id: row.id,
    title: row.title,
    seed: row.seed,
    performerId: row.performer_id,
    modelId: row.model_id,
    researchPreset: row.research_preset,
    answerDensity: row.answer_density,
    imagePreference: row.image_preference,
    currentTurnId: row.current_turn_id,
    turnCount: row.turn_count,
    sourceCount: row.source_count,
    openBranchCount: row.open_branch_count,
    version: row.version,
    pinned: Boolean(row.pinned),
    hidden: Boolean(row.hidden),
    updatedAt: row.updated_at,
    topicLabels,
  };
}

function summaryFromDetail(detail: JourneyDetail): JourneySummary {
  return {
    id: detail.id,
    title: detail.title,
    seed: detail.seed,
    performerId: detail.performerId,
    modelId: detail.modelId,
    researchPreset: detail.researchPreset,
    answerDensity: detail.answerDensity,
    imagePreference: detail.imagePreference,
    currentTurnId: detail.currentTurnId,
    turnCount: detail.turnCount,
    sourceCount: detail.sourceCount,
    openBranchCount: detail.openBranchCount,
    version: detail.version,
    pinned: detail.pinned,
    hidden: detail.hidden,
    updatedAt: detail.updatedAt,
    topicLabels: detail.topicLabels,
  };
}

function parseAnswerPayload(
  value: string | null,
  answer: string,
): { blocks: JourneyTurn["answerBlocks"]; media: JourneyTurn["media"] } {
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return { blocks: parsed, media: [] };
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.blocks)) {
        const candidates = Array.isArray(parsed.media) ? parsed.media : parsed.media ? [parsed.media] : [];
        const media = candidates.filter((item: unknown): item is JourneyTurn["media"][number] =>
          Boolean(item) && typeof item === "object"
          && typeof (item as JourneyTurn["media"][number]).imageUrl === "string"
          && typeof (item as JourneyTurn["media"][number]).sourcePageUrl === "string"
          && typeof (item as JourneyTurn["media"][number]).caption === "string"
          && typeof (item as JourneyTurn["media"][number]).alt === "string",
        ).slice(0, 10);
        return { blocks: parsed.blocks, media };
      }
    } catch {
      // Older rows fall back to their plain-text answer.
    }
  }
  const blocks = answer.split(/\n\n+/).map((text) => ({ text, sourceIds: [] }));
  return { blocks, media: [] };
}

function parseResearchHandoff(value: string | null) {
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") {
        return {
          discoveries: stringArray(parsed.discoveries),
          uncertainties: stringArray(parsed.uncertainties),
          unresolvedThreads: stringArray(parsed.unresolvedThreads),
          sourceLeads: stringArray(parsed.sourceLeads),
        };
      }
    } catch {
      // Older rows receive an empty bounded handoff.
    }
  }
  return { discoveries: [], uncertainties: [], unresolvedThreads: [], sourceLeads: [] };
}

function safeJsonObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: keyof T) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const value = String(row[key]);
    const group = result.get(value) ?? [];
    group.push(row);
    result.set(value, group);
  }
  return result;
}

function validateCreateRequest(request: CreateJourneyRequest) {
  if (!request || typeof request !== "object") {
    throw new RepositoryError("BAD_REQUEST", "A journey configuration is required.", 400);
  }
  normalizeSeed(request.seed);
  if (!PERFORMERS.some((performer) => performer.id === request.performerId)) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported performer.", 400);
  }
  if (!MODELS.some((model) => model.id === request.modelId)) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported demo model.", 400);
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
  assertIdempotencyKey(request.idempotencyKey);
}

function validateAdvanceRequest(request: AdvanceJourneyRequest) {
  if (!request || typeof request !== "object") {
    throw new RepositoryError("BAD_REQUEST", "An action is required.", 400);
  }
  assertId(request.fromTurnId, "turn");
  if (!["choose", "reject", "delegate"].includes(request.action)) {
    throw new RepositoryError("BAD_REQUEST", "Choose, reject, or delegate the current paths.", 400);
  }
  if (request.action === "choose" && !request.optionId) {
    throw new RepositoryError("BAD_REQUEST", "Choose one of the two path IDs.", 400);
  }
  if (request.optionId) assertId(request.optionId, "option");
  if (!Number.isInteger(request.expectedVersion) || request.expectedVersion < 1) {
    throw new RepositoryError("BAD_REQUEST", "A valid journey version is required.", 400);
  }
  if (
    request.adventure !== undefined &&
    (!Number.isFinite(request.adventure) || request.adventure < 0 || request.adventure > 100)
  ) {
    throw new RepositoryError("BAD_REQUEST", "Adventure must be between 0 and 100.", 400);
  }
  if (request.reason !== undefined && (typeof request.reason !== "string" || request.reason.trim().length > 240)) {
    throw new RepositoryError("BAD_REQUEST", "Keep the rejection reason under 240 characters.", 400);
  }
  assertIdempotencyKey(request.idempotencyKey);
}

function assertMutationChanged(result: D1Result<unknown> | undefined) {
  if (!result || (result.meta.changes ?? 0) === 0) {
    throw new RepositoryError(
      "VERSION_CONFLICT",
      "This journey changed before the action could be saved. Reload and try again.",
      409,
      true,
    );
  }
}

function formatList(values: string[]): string {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
