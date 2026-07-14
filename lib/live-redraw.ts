import { PROMPT_VERSION, performerById } from "./catalog";
import type { JourneyTurn, ModelId, PerformerId } from "./contracts";
import { RepositoryError } from "./errors";
import { isRecord, outputText, requestOpenAI, structuredOutput } from "./openai";

type RedrawResult = {
  preferredPosition: 0 | 1;
  options: Array<{ question: string; angle: string }>;
};

const REDRAW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["preferredPosition", "options"],
  properties: {
    preferredPosition: { type: "integer", enum: [0, 1] },
    options: {
      type: "array",
      minItems: 2,
      maxItems: 2,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "angle"],
        properties: {
          question: { type: "string", minLength: 9, maxLength: 132 },
          angle: { type: "string", minLength: 1, maxLength: 39 },
        },
      },
    },
  },
} as const;

export async function runLiveRedraw(input: {
  turn: JourneyTurn;
  performerId: PerformerId;
  modelId: ModelId;
  rejectedQuestions: string[];
  adventure: number;
  reason?: string;
}): Promise<RedrawResult> {
  const performer = performerById(input.performerId);
  const response = await requestOpenAI({
      model: input.modelId,
      instructions: [
        `WonderDrive prompt ${PROMPT_VERSION}. Generate only the next two curiosity paths.`,
        "The learner has just read the supplied visible text and may also have seen the supplied factual image.",
        `Use the loose ${performer.name} cue (${performer.cue}) without rigid roleplay.`,
        "Both questions must hook into one concrete fact, object, creature, place, event, or surprising detail in the visible text or image, feel meaningfully different, and avoid every rejected question and close paraphrase.",
        "Make each one a playable rabbit hole: 5–12 words, plain everyday language, one idea at a time, fun to say out loud, and understandable instantly by a curious kid without talking down to them.",
        "Prefer concrete wonder, odd comparisons, hidden abilities, vivid cause-and-effect, and small mysteries. Avoid academic framing, jargon, stacked clauses, vague abstraction, and quiz-like recall.",
        "Do not research, answer the questions, or mention this instruction. Return the required structured output only.",
      ].join("\n"),
      input: JSON.stringify({
        visibleTopic: input.turn.topicLabel,
        visibleText: input.turn.answerBlocks.map((block) => block.text),
        visibleImage: input.turn.media,
        rejectedQuestions: input.rejectedQuestions,
        desiredAdventure: input.adventure,
        learnerNote: input.reason ?? null,
      }),
      max_output_tokens: 800,
      reasoning: { effort: "low" },
      text: structuredOutput("wonderdrive_redraw", REDRAW_SCHEMA),
      safety_identifier: "wd_question_redraw",
      store: false,
    }, {
      unavailableMessage: "Live question redrawing is not configured on this deployment.",
  });
  if (!response.ok) {
    throw new RepositoryError(
      "PROVIDER_ERROR",
      response.status === 429
        ? "Question redrawing is busy. Please try again shortly."
        : "WonderDrive could not redraw the questions right now.",
      response.status === 429 ? 429 : 502,
      true,
    );
  }
  const payload = await response.json();
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText(payload));
  } catch {
    throw invalidRedraw();
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.options) || parsed.options.length !== 2) {
    throw invalidRedraw();
  }
  const options = parsed.options.map((value) => {
    if (!isRecord(value)) throw invalidRedraw();
    return {
      question: normalizeTextValue(value.question, 12, 110),
      angle: normalizeTextValue(value.angle, 2, 32),
    };
  });
  if (tooSimilar(options[0].question, options[1].question)) throw invalidRedraw();
  if (options.some((option) => input.rejectedQuestions.some((rejected) => tooSimilar(option.question, rejected)))) {
    throw new RepositoryError(
      "RESEARCH_VALIDATION_FAILED",
      "The redraw repeated a path you already rejected. Nothing changed; please retry.",
      502,
      true,
    );
  }
  return {
    preferredPosition: parsed.preferredPosition === 1 ? 1 : 0,
    options,
  };
}

function normalizeTextValue(value: unknown, min: number, max: number) {
  const text = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (text.length < Math.floor(min * 0.8) || text.length > Math.ceil(max * 1.2)) throw invalidRedraw();
  return text;
}

function tooSimilar(left: string, right: string) {
  const leftWords = new Set(normalize(left).split(" ").filter(Boolean));
  const rightWords = new Set(normalize(right).split(" ").filter(Boolean));
  const leftText = [...leftWords].join(" ");
  const rightText = [...rightWords].join(" ");
  if (leftText === rightText || leftText.includes(rightText) || rightText.includes(leftText)) return true;
  const overlap = [...leftWords].filter((word) => rightWords.has(word)).length;
  const union = new Set([...leftWords, ...rightWords]).size;
  return union > 0 && overlap / union >= 0.55;
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function invalidRedraw() {
  return new RepositoryError(
    "SCHEMA_INVALID",
    "The replacement questions did not pass WonderDrive’s relevance checks. Nothing changed; please retry.",
    502,
    true,
  );
}
