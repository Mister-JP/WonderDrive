import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = process.argv[2];
const outputPath = process.argv[3];

if (!databasePath || !outputPath) {
  throw new Error("Usage: node scripts/snapshot-starter-journeys.mjs <database.sqlite> <output.json>");
}

const selections = [
  { key: "blood-falls", journeyId: "87d19252-44ac-4492-9fcc-4f29881df7da" },
  { key: "optical-color-mixing", journeyId: "aeccdfea-366f-4667-867b-89b17c683087" },
  { key: "kelvin-helmholtz-clouds", journeyId: "4d59083c-20d9-4d67-ba2a-95b6bcf64e84" },
];

const database = new DatabaseSync(resolve(databasePath), { readOnly: true });

const journeyQuery = database.prepare(`
  SELECT j.seed, j.title, j.performer_id AS performerId, j.model_id AS modelId,
         j.research_preset AS researchPreset, j.answer_density AS answerDensity,
         j.image_preference AS imagePreference, j.output_locale AS outputLocale,
         t.id AS sourceTurnId, t.question, t.answer, t.answer_json AS answerJson,
         t.transition, t.topic_label AS topicLabel, t.research_summary AS researchSummary,
         t.research_handoff_json AS researchHandoffJson,
         t.preferred_position AS preferredPosition, t.option_set_version AS optionSetVersion,
         t.provider AS turnProvider, t.model_id AS turnModelId,
         t.prompt_version AS promptVersion, t.performer_version AS performerVersion,
         t.model_snapshot AS modelSnapshot, t.answer_density AS turnAnswerDensity,
         t.image_preference AS turnImagePreference, t.output_locale AS turnOutputLocale
  FROM journeys j
  JOIN turns t ON t.id = j.current_turn_id AND t.journey_id = j.id
  WHERE j.id = ? AND j.deleted_at IS NULL
`);

const optionQuery = database.prepare(`
  SELECT position, question, angle
  FROM turn_options
  WHERE turn_id = ? AND set_version = ? AND state = 'proposed'
  ORDER BY position
`);

const sourceQuery = database.prepare(`
  SELECT s.id, s.canonical_url AS url, s.title, s.publisher,
         s.published_at AS publishedAt, s.provider_source_id AS providerSourceId,
         s.warning, s.license_note AS licenseNote, ts.relation
  FROM turn_sources ts
  JOIN sources s ON s.id = ts.source_id
  WHERE ts.turn_id = ?
  ORDER BY s.title, s.id
`);

const runQuery = database.prepare(`
  SELECT id AS sourceRunId, provider, model_id AS modelId, preset,
         input_tokens AS inputTokens, cached_input_tokens AS cachedInputTokens,
         output_tokens AS outputTokens, reasoning_tokens AS reasoningTokens,
         total_tokens AS totalTokens, web_search_calls AS webSearchCalls,
         page_fetches AS pageFetches, latency_ms AS latencyMs,
         estimated_cost_microusd AS estimatedCostMicrousd,
         rate_effective_at AS rateEffectiveAt
  FROM research_runs
  WHERE turn_id = ? AND status = 'ready'
  LIMIT 1
`);

const eventQuery = database.prepare(`
  SELECT sequence, kind, label, source_id AS sourceId
  FROM research_events
  WHERE research_run_id = ?
  ORDER BY sequence
`);

const journeys = selections.map(({ key, journeyId }) => {
  const row = journeyQuery.get(journeyId);
  if (!row) throw new Error(`Starter journey ${journeyId} was not found.`);
  const run = runQuery.get(row.sourceTurnId);
  if (!run) throw new Error(`Ready research for starter journey ${journeyId} was not found.`);

  return {
    key,
    seed: row.seed,
    title: row.title,
    performerId: row.performerId,
    modelId: row.modelId,
    researchPreset: row.researchPreset,
    answerDensity: row.answerDensity,
    imagePreference: row.imagePreference,
    outputLocale: row.outputLocale,
    turn: {
      question: row.question,
      answer: row.answer,
      answerPayload: JSON.parse(row.answerJson),
      transition: row.transition,
      topicLabel: row.topicLabel,
      researchSummary: row.researchSummary,
      researchHandoff: JSON.parse(row.researchHandoffJson),
      preferredPosition: row.preferredPosition,
      provider: row.turnProvider,
      modelId: row.turnModelId,
      promptVersion: row.promptVersion,
      performerVersion: row.performerVersion,
      modelSnapshot: row.modelSnapshot,
      answerDensity: row.turnAnswerDensity,
      imagePreference: row.turnImagePreference,
      outputLocale: row.turnOutputLocale,
      options: optionQuery.all(row.sourceTurnId, row.optionSetVersion),
      sources: sourceQuery.all(row.sourceTurnId),
      research: {
        provider: run.provider,
        modelId: run.modelId,
        preset: run.preset,
        inputTokens: run.inputTokens,
        cachedInputTokens: run.cachedInputTokens,
        outputTokens: run.outputTokens,
        reasoningTokens: run.reasoningTokens,
        totalTokens: run.totalTokens,
        webSearchCalls: run.webSearchCalls,
        pageFetches: run.pageFetches,
        latencyMs: run.latencyMs,
        estimatedCostMicrousd: run.estimatedCostMicrousd,
        rateEffectiveAt: run.rateEffectiveAt,
        events: eventQuery.all(run.sourceRunId),
      },
    },
  };
});

const destination = resolve(outputPath);
mkdirSync(dirname(destination), { recursive: true });
writeFileSync(destination, `${JSON.stringify({ version: 1, journeys }, null, 2)}\n`);
database.close();

console.log(`Snapshotted ${journeys.length} starter journeys to ${destination}`);
