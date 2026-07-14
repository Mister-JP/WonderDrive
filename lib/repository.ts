import { MODELS, PERFORMERS } from "./catalog";
import type {
  AdvanceJourneyRequest,
  CompareResult,
  CreateJourneyRequest,
  JourneyDetail,
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

type ErrorCode =
  | "BAD_REQUEST"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VERSION_CONFLICT"
  | "IDEMPOTENCY_CONFLICT"
  | "JOURNEY_LIMIT"
  | "INTERNAL_ERROR";

export class RepositoryError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

type JourneyRow = {
  id: string;
  seed: string;
  title: string;
  performer_id: PerformerId;
  model_id: ModelId;
  research_preset: ResearchPreset;
  current_turn_id: string;
  turn_count: number;
  source_count: number;
  status: "active" | "paused";
  version: number;
  updated_at: number;
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
  preferred_position: number;
  option_set_version: number;
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
};

type EventRow = {
  turn_id: string;
  id: string;
  sequence: number;
  kind: JourneyTurn["researchEvents"][number]["kind"];
  label: string;
  source_id: string | null;
};

type InterludeRow = {
  turn_id: string;
  id: string;
  text: string;
  source_title: string;
  source_url: string;
};

const PRESETS: ResearchPreset[] = ["spark", "standard", "deep"];

export async function createJourney(
  viewer: ViewerContext,
  request: CreateJourneyRequest,
): Promise<JourneyDetail> {
  validateCreateRequest(request);
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
          (id, owner_identity_id, seed, title, performer_id, model_id, research_preset, current_turn_id, turn_count, source_count, last_action, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 'created', 'active', 1, ?, ?)`,
      )
      .bind(
        journeyId,
        viewer.identityId,
        seed,
        titleFromSeed(seed),
        request.performerId,
        request.modelId,
        request.researchPreset,
        turnId,
        draft.sources.length,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO turns
          (id, journey_id, parent_turn_id, depth, question, status, answer, answer_json, transition, topic_label, research_summary, preferred_position, fixture_key, option_set_version, provider, model_id, prompt_version, created_at, ready_at)
         VALUES (?, ?, NULL, 0, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, 0, 'fixture', ?, 'phase-1-fixture-v1', ?, ?)`,
      )
      .bind(
        turnId,
        journeyId,
        seed,
        draft.answer,
        JSON.stringify(draft.answerBlocks),
        draft.transition,
        draft.topicLabel,
        draft.researchSummary,
        draft.preferredPosition,
        draft.fixtureKey,
        request.modelId,
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
      `SELECT id, seed, title, performer_id, model_id, research_preset, current_turn_id,
              turn_count, source_count, status, version, updated_at
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
      `SELECT id, seed, title, performer_id, model_id, research_preset, current_turn_id,
              turn_count, source_count, status, version, updated_at
       FROM journeys
       WHERE id = ? AND owner_identity_id = ? AND deleted_at IS NULL LIMIT 1`,
    )
    .bind(journeyId, viewer.identityId)
    .first<JourneyRow>();
  if (!journey) {
    throw new RepositoryError("NOT_FOUND", "That saved journey was not found.", 404);
  }

  const [turnsResult, optionsResult, sourcesResult, eventsResult, interludesResult] =
    await Promise.all([
      db
        .prepare(
          `SELECT id, parent_turn_id, depth, question, answer, answer_json, transition,
                  topic_label, research_summary, preferred_position, option_set_version, created_at
           FROM turns WHERE journey_id = ? AND status = 'ready'
           ORDER BY created_at, depth`,
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
          `SELECT ts.turn_id, s.id, s.title, s.publisher, s.canonical_url, ts.relation
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
          `SELECT i.turn_id, i.id, i.text, i.source_title, i.source_url
           FROM turn_interludes i
           JOIN turns t ON t.id = i.turn_id
           WHERE t.journey_id = ?`,
        )
        .bind(journeyId)
        .all<InterludeRow>(),
    ]);

  const options = groupBy(optionsResult.results, "turn_id");
  const sources = groupBy(sourcesResult.results, "turn_id");
  const events = groupBy(eventsResult.results, "turn_id");
  const interludes = new Map(interludesResult.results.map((item) => [item.turn_id, item]));
  const topicLabels: string[] = [];
  const turns: JourneyTurn[] = turnsResult.results.map((turn) => {
    if (turn.topic_label && !topicLabels.includes(turn.topic_label)) topicLabels.push(turn.topic_label);
    const interlude = interludes.get(turn.id);
    return {
      id: turn.id,
      parentTurnId: turn.parent_turn_id,
      depth: turn.depth,
      question: turn.question,
      answer: turn.answer ?? "",
      answerBlocks: parseAnswerBlocks(turn.answer_json, turn.answer ?? ""),
      transition: turn.transition ?? "",
      topicLabel: turn.topic_label ?? "open question",
      researchSummary: turn.research_summary ?? "",
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
      })),
      researchEvents: (events.get(turn.id) ?? []).map((event) => ({
        id: event.id,
        sequence: event.sequence,
        kind: event.kind,
        label: event.label,
        sourceId: event.source_id,
      })),
      interlude: interlude
        ? {
            id: interlude.id,
            text: interlude.text,
            sourceTitle: interlude.source_title,
            sourceUrl: interlude.source_url,
          }
        : {
            id: `missing-${turn.id}`,
            text: "This fixture turn has no interlude.",
            sourceTitle: "WonderDrive",
            sourceUrl: "https://github.com/Mister-JP/WonderDrive",
          },
      createdAt: turn.created_at,
    };
  });

  return {
    ...summaryFromRow(journey, topicLabels),
    status: journey.status,
    turns,
  };
}

export async function advanceJourney(
  viewer: ViewerContext,
  journeyId: string,
  request: AdvanceJourneyRequest,
): Promise<JourneyDetail> {
  validateAdvanceRequest(request);
  const db = getD1();
  const payloadHash = await hashPayload({
    fromTurnId: request.fromTurnId,
    action: request.action,
    optionId: request.optionId ?? null,
    adventure: request.adventure ?? null,
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
    const draft = buildFixtureTurn({
      question: fromTurn.question,
      depth: fromTurn.depth,
      performerId: journey.performerId,
      rejectionCount: setVersion,
      adventure: request.adventure ?? 50,
    });
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
      ...conditionalOptionStatements(
        db,
        fromTurn.id,
        setVersion,
        draft,
        journeyId,
        viewer.identityId,
        request.expectedVersion,
      ),
      db
        .prepare(
          `UPDATE turns SET option_set_version = ?
           WHERE id = ? AND journey_id = ?
             AND EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
        )
        .bind(
          setVersion,
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
          crypto.randomUUID(),
          journeyId,
          fromTurn.id,
          request.idempotencyKey,
          payloadHash,
          JSON.stringify({ adventure: request.adventure ?? 50, setVersion }),
          now,
          journeyId,
          viewer.identityId,
          request.expectedVersion,
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
  if (
    !selected ||
    (fromTurn.id === journey.currentTurnId && selected.state !== "proposed")
  ) {
    throw new RepositoryError("BAD_REQUEST", "Choose one of the two current paths.", 400);
  }

  const childId = crypto.randomUUID();
  const runId = crypto.randomUUID();
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
        `UPDATE turn_options SET state = 'superseded'
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
          (id, journey_id, parent_turn_id, depth, question, status, answer, answer_json, transition, topic_label, research_summary, preferred_position, fixture_key, option_set_version, provider, model_id, prompt_version, created_at, ready_at)
         SELECT ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, 0, 'fixture', ?, 'phase-1-fixture-v1', ?, ?
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        childId,
        journeyId,
        fromTurn.id,
        childDepth,
        selected.question,
        draft.answer,
        JSON.stringify(draft.answerBlocks),
        draft.transition,
        draft.topicLabel,
        draft.researchSummary,
        draft.preferredPosition,
        draft.fixtureKey,
        journey.modelId,
        now,
        now,
        journeyId,
        viewer.identityId,
        request.expectedVersion,
      ),
    ...conditionalOptionStatements(
      db,
      childId,
      0,
      draft,
      journeyId,
      viewer.identityId,
      request.expectedVersion,
    ),
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
        crypto.randomUUID(),
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
  const left = summaryFromDetail(leftDetail);
  const right = summaryFromDetail(rightDetail);
  const sharedTopics = left.topicLabels.filter((topic) => right.topicLabels.includes(topic));
  const leftOnlyTopics = left.topicLabels.filter((topic) => !right.topicLabels.includes(topic));
  const rightOnlyTopics = right.topicLabels.filter((topic) => !left.topicLabels.includes(topic));
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
  return { left, right, sharedTopics, leftOnlyTopics, rightOnlyTopics, observations };
}

function optionStatements(
  db: D1Database,
  turnId: string,
  setVersion: number,
  draft: FixtureTurnDraft,
) {
  return draft.options.map((option, position) =>
    db
      .prepare(
        "INSERT INTO turn_options (id, turn_id, set_version, position, question, angle, state) VALUES (?, ?, ?, ?, ?, ?, 'proposed')",
      )
      .bind(crypto.randomUUID(), turnId, setVersion, position, option.question, option.angle),
  );
}

function conditionalOptionStatements(
  db: D1Database,
  turnId: string,
  setVersion: number,
  draft: FixtureTurnDraft,
  journeyId: string,
  identityId: string,
  expectedVersion: number,
) {
  return draft.options.map((option, position) =>
    db
      .prepare(
        `INSERT INTO turn_options (id, turn_id, set_version, position, question, angle, state)
         SELECT ?, ?, ?, ?, ?, ?, 'proposed'
         WHERE EXISTS (SELECT 1 FROM journeys WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL)`,
      )
      .bind(
        crypto.randomUUID(),
        turnId,
        setVersion,
        position,
        option.question,
        option.angle,
        journeyId,
        identityId,
        expectedVersion,
      ),
  );
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
  statements.push(
    db
      .prepare(
        `INSERT INTO turn_interludes
          (id, turn_id, fact_key, text, source_url, source_title, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.turnId,
        draft.interlude.factKey,
        draft.interlude.text,
        draft.interlude.sourceUrl,
        draft.interlude.sourceTitle,
        now,
      ),
  );
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
  statements.push(
    db
      .prepare(
        `INSERT INTO turn_interludes
          (id, turn_id, fact_key, text, source_url, source_title, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM turns WHERE id = ? AND journey_id = ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.turnId,
        draft.interlude.factKey,
        draft.interlude.text,
        draft.interlude.sourceUrl,
        draft.interlude.sourceTitle,
        now,
        input.turnId,
        input.journeyId,
      ),
  );
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
    currentTurnId: row.current_turn_id,
    turnCount: row.turn_count,
    sourceCount: row.source_count,
    version: row.version,
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
    currentTurnId: detail.currentTurnId,
    turnCount: detail.turnCount,
    sourceCount: detail.sourceCount,
    version: detail.version,
    updatedAt: detail.updatedAt,
    topicLabels: detail.topicLabels,
  };
}

function parseAnswerBlocks(value: string | null, answer: string) {
  if (value) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Older rows fall back to their plain-text answer.
    }
  }
  return answer.split(/\n\n+/).map((text) => ({ text, sourceIds: [] }));
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
    throw new RepositoryError("BAD_REQUEST", "Choose a supported Phase 1 model fixture.", 400);
  }
  if (!PRESETS.includes(request.researchPreset)) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported research preset.", 400);
  }
  validateIdempotencyKey(request.idempotencyKey);
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
  validateIdempotencyKey(request.idempotencyKey);
}

function validateIdempotencyKey(value: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 100) {
    throw new RepositoryError("BAD_REQUEST", "A valid request key is required.", 400);
  }
}

function normalizeSeed(seed: string): string {
  if (typeof seed !== "string") {
    throw new RepositoryError("BAD_REQUEST", "Start with a question.", 400);
  }
  const normalized = seed.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 280) {
    throw new RepositoryError("BAD_REQUEST", "Keep the starting question between 3 and 280 characters.", 400);
  }
  return normalized;
}

function titleFromSeed(seed: string): string {
  return seed.length <= 62 ? seed : `${seed.slice(0, 59).trimEnd()}…`;
}

function assertId(value: string, label: string) {
  if (typeof value !== "string" || value.length < 8 || value.length > 100) {
    throw new RepositoryError("BAD_REQUEST", `A valid ${label} ID is required.`, 400);
  }
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

async function hashPayload(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function formatList(values: string[]): string {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
}
