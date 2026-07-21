import { getD1 } from "../db";
import { modelById, performerById, PROMPT_VERSION } from "./catalog";
import type { PerformerId } from "./contracts";
import { buildFixtureTurn, stableKey } from "./fixtures";
import { STARTER_FIXTURE_PREFIX, STARTER_TITLE_PREFIX } from "./starter-content-contract";

const STARTER_JOURNEYS: ReadonlyArray<{
  title: string;
  question: string;
  performerId: PerformerId;
}> = [
  {
    title: `${STARTER_TITLE_PREFIX}The sound of a city`,
    question: "How does the sound of a city reveal the way it was built?",
    performerId: "mechanist",
  },
  {
    title: `${STARTER_TITLE_PREFIX}What maps leave out`,
    question: "How can a map be accurate and still leave out the truth?",
    performerId: "atlas",
  },
  {
    title: `${STARTER_TITLE_PREFIX}How places remember`,
    question: "How does a city remember something after the original place is gone?",
    performerId: "sage",
  },
];

/**
 * Adds a small, fully usable library to a newly created identity. This must only
 * be called as part of identity creation: deleted examples intentionally stay
 * deleted and are never replenished from an empty-library read.
 */
export async function seedStarterContent(identityId: string, now = Date.now()) {
  const db = getD1();
  await db.batch(starterContentStatements(db, identityId, now));
}

export function starterContentStatements(
  db: D1Database,
  identityId: string,
  now: number,
): D1PreparedStatement[] {
  const model = modelById("gpt-5.6-luna");
  const statements: D1PreparedStatement[] = [];

  STARTER_JOURNEYS.forEach((starter, starterIndex) => {
    const createdAt = now + starterIndex;
    const journeyId = crypto.randomUUID();
    const turnId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const bookmarkId = crypto.randomUUID();
    const draft = buildFixtureTurn({
      question: starter.question,
      depth: 0,
      performerId: starter.performerId,
    });
    const fixtureKey = `${STARTER_FIXTURE_PREFIX}${draft.fixtureKey}`;

    statements.push(
      db.prepare(
        `INSERT INTO journeys
          (id, owner_identity_id, seed, title, performer_id, model_id, research_preset,
           answer_density, image_preference, output_locale, current_turn_id, turn_count,
           source_count, last_action, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'standard', 'balanced', 'prefer', 'en', ?, 1, ?,
                 'starter-example', 'active', 1, ?, ?)`,
      ).bind(
        journeyId,
        identityId,
        starter.question,
        starter.title,
        starter.performerId,
        model.id,
        turnId,
        draft.sources.length,
        createdAt,
        createdAt,
      ),
      db.prepare(
        `INSERT INTO turns
          (id, journey_id, parent_turn_id, depth, question, status, answer, answer_json,
           transition, topic_label, research_summary, research_handoff_json, preferred_position,
           fixture_key, option_set_version, provider, model_id, prompt_version,
           performer_version, model_snapshot, answer_density, image_preference, output_locale,
           created_at, ready_at)
         VALUES (?, ?, NULL, 0, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 0, 'fixture', ?, ?, ?, ?,
                 'balanced', 'prefer', 'en', ?, ?)`,
      ).bind(
        turnId,
        journeyId,
        starter.question,
        draft.answer,
        JSON.stringify({ blocks: draft.answerBlocks, media: draft.media }),
        draft.transition,
        draft.topicLabel,
        draft.researchSummary,
        JSON.stringify(draft.researchHandoff),
        draft.preferredPosition,
        fixtureKey,
        model.id,
        PROMPT_VERSION,
        performerById(starter.performerId).version,
        model.snapshot,
        createdAt,
        createdAt,
      ),
    );

    draft.options.forEach((option, position) => {
      statements.push(
        db.prepare(
          `INSERT INTO turn_options
            (id, turn_id, set_version, position, question, angle, state)
           VALUES (?, ?, 0, ?, ?, ?, 'proposed')`,
        ).bind(crypto.randomUUID(), turnId, position, option.question, option.angle),
      );
    });

    statements.push(
      db.prepare(
        `INSERT INTO research_runs
          (id, journey_id, turn_id, provider, model_id, preset, status,
           started_at, completed_at, created_at)
         VALUES (?, ?, ?, 'fixture', ?, 'standard', 'ready', ?, ?, ?)`,
      ).bind(runId, journeyId, turnId, model.id, createdAt, createdAt, createdAt),
    );

    draft.sources.forEach((source) => {
      const sourceId = stableKey(source.url);
      statements.push(
        db.prepare(
          `INSERT INTO sources (id, canonical_url, title, publisher, retrieved_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(canonical_url) DO UPDATE SET
             title = excluded.title,
             publisher = excluded.publisher,
             retrieved_at = excluded.retrieved_at`,
        ).bind(sourceId, source.url, source.title, source.publisher, createdAt),
        db.prepare(
          `INSERT OR IGNORE INTO turn_sources (turn_id, source_id, relation)
           VALUES (?, ?, 'cited')`,
        ).bind(turnId, sourceId),
      );
    });

    draft.researchEvents.forEach((event) => {
      const source = event.kind === "source" ? draft.sources[event.sequence === 1 ? 0 : 1] : null;
      statements.push(
        db.prepare(
          `INSERT INTO research_events
            (id, research_run_id, sequence, kind, label, source_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          crypto.randomUUID(),
          runId,
          event.sequence,
          event.kind,
          event.label,
          source ? stableKey(source.url) : null,
          createdAt + event.sequence,
        ),
      );
    });

    statements.push(
      db.prepare(
        `INSERT INTO bookmarks (id, identity_id, journey_id, turn_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(bookmarkId, identityId, journeyId, turnId, createdAt),
    );
  });

  return statements;
}
