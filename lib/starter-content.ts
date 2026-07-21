import starterLibrary from "../editorial/starter/starter-journeys.json";
import { getD1 } from "../db";
import type {
  AnswerBlock,
  AnswerDensity,
  ImagePreference,
  ModelId,
  PerformerId,
  ResearchPreset,
  Source,
  SupportedLocale,
  TurnMedia,
} from "./contracts";
import { STARTER_FIXTURE_PREFIX, STARTER_TITLE_PREFIX } from "./starter-content-contract";

type StarterSource = {
  id: string;
  url: string;
  title: string;
  publisher: string;
  publishedAt: string | null;
  providerSourceId: string | null;
  warning: string | null;
  licenseNote: string | null;
  relation: Source["relation"];
};

type StarterJourney = {
  key: string;
  seed: string;
  title: string;
  performerId: PerformerId;
  modelId: ModelId;
  researchPreset: ResearchPreset;
  answerDensity: AnswerDensity;
  imagePreference: ImagePreference;
  outputLocale: SupportedLocale;
  turn: {
    question: string;
    answer: string;
    answerPayload: { blocks: AnswerBlock[]; media: TurnMedia[] };
    transition: string;
    topicLabel: string;
    researchSummary: string;
    researchHandoff: Record<string, string[]>;
    preferredPosition: 0 | 1;
    provider: string;
    modelId: ModelId;
    promptVersion: string;
    performerVersion: string;
    modelSnapshot: string;
    answerDensity: AnswerDensity;
    imagePreference: ImagePreference;
    outputLocale: SupportedLocale;
    options: Array<{ position: number; question: string; angle: string }>;
    sources: StarterSource[];
    research: {
      provider: string;
      modelId: ModelId;
      preset: ResearchPreset;
      inputTokens: number;
      cachedInputTokens: number;
      outputTokens: number;
      reasoningTokens: number;
      totalTokens: number;
      webSearchCalls: number;
      pageFetches: number;
      latencyMs: number;
      estimatedCostMicrousd: number;
      rateEffectiveAt: string;
      events: Array<{
        sequence: number;
        kind: string;
        label: string;
        sourceId: string | null;
      }>;
    };
  };
};

const STARTER_JOURNEYS = starterLibrary.journeys as StarterJourney[];

/**
 * Adds three editorial snapshots of real, user-bookmarked research journeys to
 * a newly created identity. This is only called during identity creation, so a
 * deleted example remains deleted and an intentionally empty library stays empty.
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
  const statements: D1PreparedStatement[] = [];

  STARTER_JOURNEYS.forEach((starter, starterIndex) => {
    const createdAt = now + starterIndex;
    const journeyId = crypto.randomUUID();
    const turnId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const bookmarkId = crypto.randomUUID();
    const fixtureKey = `${STARTER_FIXTURE_PREFIX}${starter.key}`;

    statements.push(
      db.prepare(
        `INSERT INTO journeys
          (id, owner_identity_id, seed, title, performer_id, model_id, research_preset,
           answer_density, image_preference, output_locale, current_turn_id, turn_count,
           source_count, last_action, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?,
                 'starter-example', 'active', 1, ?, ?)`,
      ).bind(
        journeyId,
        identityId,
        starter.seed,
        `${STARTER_TITLE_PREFIX}${starter.title}`,
        starter.performerId,
        starter.modelId,
        starter.researchPreset,
        starter.answerDensity,
        starter.imagePreference,
        starter.outputLocale,
        turnId,
        starter.turn.sources.length,
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
         VALUES (?, ?, NULL, 0, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        turnId,
        journeyId,
        starter.turn.question,
        starter.turn.answer,
        JSON.stringify(starter.turn.answerPayload),
        starter.turn.transition,
        starter.turn.topicLabel,
        starter.turn.researchSummary,
        JSON.stringify(starter.turn.researchHandoff),
        starter.turn.preferredPosition,
        fixtureKey,
        starter.turn.provider,
        starter.turn.modelId,
        starter.turn.promptVersion,
        starter.turn.performerVersion,
        starter.turn.modelSnapshot,
        starter.turn.answerDensity,
        starter.turn.imagePreference,
        starter.turn.outputLocale,
        createdAt,
        createdAt,
      ),
    );

    statements.push(multiValueStatement(
      db,
      `INSERT INTO turn_options
        (id, turn_id, set_version, position, question, angle, state)
       VALUES `,
      starter.turn.options.map((option) => ({
        placeholders: "(?, ?, 0, ?, ?, ?, 'proposed')",
        bindings: [crypto.randomUUID(), turnId, option.position, option.question, option.angle],
      })),
    ));

    const research = starter.turn.research;
    statements.push(
      db.prepare(
        `INSERT INTO research_runs
          (id, journey_id, turn_id, provider, model_id, preset, status,
           input_tokens, cached_input_tokens, output_tokens, reasoning_tokens, total_tokens,
           web_search_calls, page_fetches, latency_ms, estimated_cost_microusd,
           rate_effective_at, started_at, completed_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        runId,
        journeyId,
        turnId,
        research.provider,
        research.modelId,
        research.preset,
        research.inputTokens,
        research.cachedInputTokens,
        research.outputTokens,
        research.reasoningTokens,
        research.totalTokens,
        research.webSearchCalls,
        research.pageFetches,
        research.latencyMs,
        research.estimatedCostMicrousd,
        research.rateEffectiveAt,
        createdAt,
        createdAt,
        createdAt,
      ),
      ...multiValueStatements(
        db,
        `INSERT INTO sources
          (id, canonical_url, title, publisher, published_at, provider_source_id,
           warning, license_note, retrieved_at)
         VALUES `,
        starter.turn.sources.map((source) => ({
          placeholders: "(?, ?, ?, ?, ?, ?, ?, ?, ?)",
          bindings: [
            source.id,
            source.url,
            source.title,
            source.publisher,
            source.publishedAt,
            source.providerSourceId,
            source.warning,
            source.licenseNote,
            createdAt,
          ],
        })),
        ` ON CONFLICT(canonical_url) DO UPDATE SET
            title = excluded.title,
            publisher = excluded.publisher,
            published_at = excluded.published_at,
            provider_source_id = excluded.provider_source_id,
            warning = excluded.warning,
            license_note = excluded.license_note,
            retrieved_at = excluded.retrieved_at`,
      ),
      multiValueStatement(
        db,
        "INSERT OR IGNORE INTO turn_sources (turn_id, source_id, relation) VALUES ",
        starter.turn.sources.map((source) => ({
          placeholders: "(?, ?, ?)",
          bindings: [turnId, source.id, source.relation],
        })),
      ),
      multiValueStatement(
        db,
        `INSERT INTO research_events
          (id, research_run_id, sequence, kind, label, source_id, created_at)
         VALUES `,
        research.events.map((event) => ({
          placeholders: "(?, ?, ?, ?, ?, ?, ?)",
          bindings: [
            crypto.randomUUID(),
            runId,
            event.sequence,
            event.kind,
            event.label,
            event.sourceId,
            createdAt + event.sequence,
          ],
        })),
      ),
      db.prepare(
        `INSERT INTO bookmarks (id, identity_id, journey_id, turn_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(bookmarkId, identityId, journeyId, turnId, createdAt),
    );
  });

  return statements;
}

function multiValueStatement(
  db: D1Database,
  prefix: string,
  rows: Array<{ placeholders: string; bindings: unknown[] }>,
  suffix = "",
): D1PreparedStatement {
  const sql = `${prefix}${rows.map((row) => row.placeholders).join(", ")}${suffix}`;
  return db.prepare(sql).bind(...rows.flatMap((row) => row.bindings));
}

function multiValueStatements(
  db: D1Database,
  prefix: string,
  rows: Array<{ placeholders: string; bindings: unknown[] }>,
  suffix = "",
): D1PreparedStatement[] {
  const bindingsPerRow = rows[0]?.bindings.length ?? 1;
  const rowsPerStatement = Math.max(1, Math.floor(90 / bindingsPerRow));
  const statements: D1PreparedStatement[] = [];
  for (let index = 0; index < rows.length; index += rowsPerStatement) {
    statements.push(multiValueStatement(db, prefix, rows.slice(index, index + rowsPerStatement), suffix));
  }
  return statements;
}
