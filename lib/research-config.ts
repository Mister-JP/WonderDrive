/**
 * The canonical generation profile for every selectable OpenAI model.
 *
 * Model routing may choose only `model`; prompts, reasoning, token budgets,
 * tool budgets, and deadlines must come from this shared profile.
 */
export const GENERATION_CONFIG_VERSION = "high-quality@1";

export const OPENAI_PROMPT_LIMITS = Object.freeze({
  liveResearch: Object.freeze({
    spark: Object.freeze({
      maxToolCalls: 8,
      maxOutputTokens: 20_000,
      reasoning: "high",
      timeoutMs: 180_000,
    }),
    standard: Object.freeze({
      maxToolCalls: 12,
      maxOutputTokens: 30_000,
      reasoning: "high",
      timeoutMs: 240_000,
    }),
    deep: Object.freeze({
      maxToolCalls: 16,
      maxOutputTokens: 40_000,
      reasoning: "high",
      timeoutMs: 300_000,
    }),
  }),
  starterGeneration: Object.freeze({ maxOutputTokens: 10_000, reasoning: "high" }),
  questionRedraw: Object.freeze({ maxOutputTokens: 8_000, reasoning: "high" }),
  visualCuration: Object.freeze({
    maxToolCalls: 12,
    maxOutputTokens: 20_000,
    reasoning: "high",
    timeoutMs: 180_000,
  }),
  imageNoteRepair: Object.freeze({
    maxOutputTokens: 6_000,
    reasoning: "high",
    timeoutMs: 60_000,
  }),
  citationRepair: Object.freeze({
    maxOutputTokens: 5_000,
    reasoning: "high",
    timeoutMs: 60_000,
  }),
  citationRecovery: Object.freeze({
    maxOutputTokens: 10_000,
    reasoning: "high",
    timeoutMs: 90_000,
  }),
} as const);

export const OPENAI_IMAGE_SEARCH_MAX_RESULTS = 10;
