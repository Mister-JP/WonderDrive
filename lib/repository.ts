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
  JourneyTurn,
  ModelId,
  ResearchPreset,
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
import { normalizeLocale } from "./i18n";
import { getJourney } from "./journeys/read-model";
import { projectJourneyComparison } from "./journeys/comparison";
import { isModelAllowed } from "./usage-policy";

export {
  getJourney,
  listJourneys,
  listRejectedQuestions,
} from "./journeys/read-model";

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
    imagePreference: "prefer",
    outputLocale: request.outputLocale,
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
      `Your journey capacity is full (${count?.count ?? viewer.journeyLimit}/${viewer.journeyLimit}). Delete one journey to make room.`,
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
           answer_density, image_preference, output_locale, current_turn_id, turn_count, source_count,
           last_action, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'created', 'active', 1, ?, ?)`,
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
        "prefer",
        request.outputLocale,
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
           performer_version, model_snapshot, answer_density, image_preference, output_locale, created_at, ready_at)
         VALUES (?, ?, NULL, 0, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'fixture', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        "prefer",
        request.outputLocale,
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

export async function advanceJourney(
  viewer: ViewerContext,
  journeyId: string,
  request: AdvanceJourneyRequest,
  liveRedraw?: (context: { journey: JourneyDetail; turn: JourneyTurn }) => Promise<{
    preferredPosition: 0 | 1;
    options: Array<{ question: string; angle: string }>;
  }>,
): Promise<JourneyDetail> {
  validateAdvanceRequest(viewer, request);
  const db = getD1();
  const payloadHash = await hashPayload({
    fromTurnId: request.fromTurnId,
    action: request.action,
    optionId: request.optionId ?? null,
    adventure: request.adventure ?? null,
    reason: request.reason?.trim() || null,
    modelId: request.modelId ?? null,
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
  const nextModelId = request.modelId ?? journey.modelId;
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
           SET model_id = ?, version = version + 1, last_action = 'reject', updated_at = ?
           WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL`,
        )
        .bind(nextModelId, now, journeyId, viewer.identityId, request.expectedVersion),
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
           model_snapshot, answer_density, image_preference, output_locale, created_at, ready_at)
         SELECT ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'fixture', ?, ?, ?, ?, ?, ?, ?, ?, ?
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
        "prefer",
        journey.outputLocale,
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
  const db = getD1();
  const now = Date.now();
  const results = await db.batch([
    db.prepare(
      `UPDATE journeys SET status = 'deleted', deleted_at = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND owner_identity_id = ? AND deleted_at IS NULL`,
    )
      .bind(now, now, journeyId, viewer.identityId),
    db.prepare(
      `DELETE FROM bookmarks
       WHERE identity_id = ? AND journey_id = ?
         AND EXISTS (
           SELECT 1 FROM journeys
           WHERE id = ? AND owner_identity_id = ? AND deleted_at = ?
         )`,
    ).bind(viewer.identityId, journeyId, journeyId, viewer.identityId, now),
  ]);
  const result = results[0];
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
  return projectJourneyComparison(leftDetail, rightDetail);
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
  normalizeLocale(request.outputLocale, "learning language");
  assertIdempotencyKey(request.idempotencyKey);
}

function validateAdvanceRequest(viewer: ViewerContext, request: AdvanceJourneyRequest) {
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
  if (request.modelId !== undefined && !isModelAllowed(viewer.mode, request.modelId)) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported live research model.", 400);
  }
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
