import { PROMPT_VERSION, modelById, performerById } from "../catalog";
import type {
  JourneyAction,
  JourneyDetail,
  JourneySummary,
  JourneyTurn,
  ModelId,
  PerformerId,
  ResearchPreset,
  Source,
  TurnOption,
} from "../contracts";
import { getD1 } from "../../db";
import { RepositoryError } from "../errors";
import { assertId } from "../request";
import type { ViewerContext } from "../viewer";

type JourneyRow = {
  id: string;
  seed: string;
  title: string;
  performer_id: PerformerId;
  model_id: ModelId;
  research_preset: ResearchPreset;
  answer_density: JourneySummary["answerDensity"];
  image_preference: JourneySummary["imagePreference"];
  output_locale: JourneySummary["outputLocale"];
  pinned: number;
  hidden: number;
  current_turn_id: string;
  turn_count: number;
  source_count: number;
  status: "active" | "paused";
  version: number;
  created_at: number;
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
  turn_output_locale: JourneySummary["outputLocale"] | null;
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

export async function listJourneys(viewer: ViewerContext): Promise<JourneySummary[]> {
  const db = getD1();
  const journeys = await db
    .prepare(
      `SELECT id, seed, title, performer_id, model_id, research_preset, answer_density,
              image_preference, output_locale, pinned, hidden, current_turn_id, turn_count, source_count,
              status, version, created_at, updated_at,
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
  const turns = await db
    .prepare(
      `SELECT journey_id, parent_turn_id, topic_label, answer_json FROM turns
       WHERE journey_id IN (${placeholders}) AND status = 'ready'
       ORDER BY created_at`,
    )
    .bind(...journeys.results.map((journey) => journey.id))
    .all<{ journey_id: string; parent_turn_id: string | null; topic_label: string; answer_json: string | null }>();
  const byJourney = new Map<string, string[]>();
  const leadMediaByJourney = new Map<string, JourneyTurn["media"][number]>();
  for (const turn of turns.results) {
    const values = byJourney.get(turn.journey_id) ?? [];
    if (turn.topic_label && !values.includes(turn.topic_label)) values.push(turn.topic_label);
    byJourney.set(turn.journey_id, values);
    if (turn.parent_turn_id === null && !leadMediaByJourney.has(turn.journey_id)) {
      const leadMedia = parseAnswerPayload(turn.answer_json, "").media[0];
      if (leadMedia) leadMediaByJourney.set(turn.journey_id, leadMedia);
    }
  }
  return journeys.results.map((journey) => summaryFromRow(
    journey,
    byJourney.get(journey.id) ?? [],
    leadMediaByJourney.get(journey.id),
  ));
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
              image_preference, output_locale, pinned, hidden, current_turn_id, turn_count, source_count,
              status, version, created_at, updated_at,
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
                  t.image_preference AS turn_image_preference,
                  t.output_locale AS turn_output_locale, r.provider AS run_provider,
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
        provider: turn.turn_provider ?? (turn.run_provider === "openai" ? "OpenAI" : "CuriosityPedia"),
        modelId: turn.turn_model_id ?? journey.model_id,
        modelSnapshot: turn.model_snapshot ?? modelById(journey.model_id).snapshot,
        researchPreset: journey.research_preset,
        answerDensity: turn.turn_answer_density ?? journey.answer_density,
        imagePreference: "prefer",
        outputLocale: turn.turn_output_locale ?? journey.output_locale,
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

function summaryFromRow(
  row: JourneyRow,
  topicLabels: string[],
  leadMedia?: JourneyTurn["media"][number],
): JourneySummary {
  return {
    id: row.id,
    title: row.title,
    seed: row.seed,
    performerId: row.performer_id,
    modelId: row.model_id,
    researchPreset: row.research_preset,
    answerDensity: row.answer_density,
    imagePreference: "prefer",
    outputLocale: row.output_locale,
    currentTurnId: row.current_turn_id,
    turnCount: row.turn_count,
    sourceCount: row.source_count,
    openBranchCount: row.open_branch_count,
    version: row.version,
    pinned: Boolean(row.pinned),
    hidden: Boolean(row.hidden),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    topicLabels,
    leadMedia,
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
