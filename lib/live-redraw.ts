import { PROMPT_VERSION, performerById } from "./catalog";
import type { JourneyTurn, ModelId, PerformerId, Viewer } from "./contracts";
import { RepositoryError } from "./errors";
import {
  isRecord,
  OPENAI_PROMPT_LIMITS,
  outputText,
  requestOpenAI,
  responseIncompleteReason,
  structuredOutput,
} from "./openai";
import { recordOpenAIUsage } from "./provider-usage";
import { reserveProviderCost } from "./provider-cost-control";
import { localeName } from "./i18n";
import type { ProviderAuth } from "./provider-auth";

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
  identityId: string;
  viewerMode: Viewer["mode"];
  callKey: string;
  journeyId: string;
  turn: JourneyTurn;
  performerId: PerformerId;
  modelId: ModelId;
  rejectedQuestions: string[];
  adventure: number;
  reason?: string;
  providerAuth?: ProviderAuth;
}): Promise<RedrawResult> {
  const performer = performerById(input.performerId);
  const startedAt = Date.now();
  let response: Response;
  let costReservationId: string | undefined;
  const requestBody = {
    model: input.modelId,
    instructions: buildRedrawInstructions(input, performer),
    input: JSON.stringify(buildRedrawInput(input)),
    max_output_tokens: OPENAI_PROMPT_LIMITS.questionRedraw.maxOutputTokens,
    reasoning: { effort: OPENAI_PROMPT_LIMITS.questionRedraw.reasoning },
    text: structuredOutput("curiositypedia_redraw", REDRAW_SCHEMA),
    safety_identifier: "wd_question_redraw",
    store: false,
  };
  try {
    const reservation = await reserveProviderCost({
      callKey: `redraw:${input.identityId}:${input.callKey}`,
      identityId: input.identityId,
      viewerMode: input.viewerMode,
      modelId: input.modelId,
      operation: "question_redraw",
      requestBody,
      journeyId: input.journeyId,
      turnId: input.turn.id,
      unavailableMessage: "Live question redrawing is not configured on this deployment.",
      providerAuth: input.providerAuth,
    });
    costReservationId = reservation.id ?? undefined;
    response = await requestOpenAI(requestBody, {
      unavailableMessage: "Live question redrawing is not configured on this deployment.",
      apiKey: input.providerAuth?.apiKey,
    });
  } catch (error) {
    if (costReservationId) await recordOpenAIUsage({
      identityId: input.identityId,
      costReservationId,
      journeyId: input.journeyId,
      turnId: input.turn.id,
      modelId: input.modelId,
      operation: "question_redraw",
      purpose: "user_rejected_paths",
      outcome: "transport_error",
      latencyMs: Date.now() - startedAt,
      errorCode: error instanceof Error ? error.name : "UNKNOWN_ERROR",
      errorMessage: error instanceof Error ? error.message : "Question redraw was interrupted.",
      metadata: { adventure: input.adventure, hasLearnerNote: Boolean(input.reason) },
    });
    throw error;
  }
  if (!response.ok) {
    await recordOpenAIUsage({
      identityId: input.identityId,
      costReservationId,
      journeyId: input.journeyId,
      turnId: input.turn.id,
      modelId: input.modelId,
      operation: "question_redraw",
      purpose: "user_rejected_paths",
      outcome: "http_error",
      providerRequestId: response.headers.get("x-request-id"),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      errorCode: `HTTP_${response.status}`,
      errorMessage: "Question redraw provider request was rejected.",
      metadata: { adventure: input.adventure, hasLearnerNote: Boolean(input.reason) },
    });
    throw new RepositoryError(
      "PROVIDER_ERROR",
      response.status === 429
        ? "Question redrawing is busy. Please try again shortly."
        : "CuriosityPedia could not redraw the questions right now.",
      response.status === 429 ? 429 : 502,
      true,
    );
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    await recordOpenAIUsage({
      identityId: input.identityId,
      costReservationId,
      journeyId: input.journeyId,
      turnId: input.turn.id,
      modelId: input.modelId,
      operation: "question_redraw",
      purpose: "user_rejected_paths",
      outcome: "provider_failed",
      providerRequestId: response.headers.get("x-request-id"),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      errorCode: "INVALID_PROVIDER_BODY",
      errorMessage: error instanceof Error ? error.message : "Question redraw response was unreadable.",
      metadata: { adventure: input.adventure, hasLearnerNote: Boolean(input.reason) },
    });
    throw invalidRedraw();
  }
  const incompleteReason = responseIncompleteReason(payload);
  if (incompleteReason) {
    await recordOpenAIUsage({
      identityId: input.identityId,
      costReservationId,
      journeyId: input.journeyId,
      turnId: input.turn.id,
      modelId: input.modelId,
      operation: "question_redraw",
      purpose: "user_rejected_paths",
      outcome: "incomplete",
      response: payload,
      providerRequestId: response.headers.get("x-request-id"),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      errorCode: incompleteReason === "max_output_tokens" ? "OUTPUT_LIMIT" : "INCOMPLETE",
      errorMessage: `Question redraw ended incomplete (${incompleteReason}).`,
      metadata: { adventure: input.adventure, hasLearnerNote: Boolean(input.reason) },
    });
    throw new RepositoryError(
      "PROVIDER_ERROR",
      incompleteReason === "max_output_tokens"
        ? "Question redrawing used its full reasoning and output allowance. Nothing changed; please try again."
        : "Question redrawing ended before replacement questions were complete. Nothing changed; please try again.",
      502,
      true,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText(payload));
  } catch {
    await recordRedrawValidationFailure(input, response, payload, startedAt, costReservationId);
    throw invalidRedraw();
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.options) || parsed.options.length !== 2) {
    await recordRedrawValidationFailure(input, response, payload, startedAt, costReservationId);
    throw invalidRedraw();
  }
  let options: Array<{ question: string; angle: string }>;
  try {
    options = parsed.options.map((value) => {
      if (!isRecord(value)) throw invalidRedraw();
      return {
        question: normalizeTextValue(value.question, 12, 110),
        angle: normalizeTextValue(value.angle, 2, 32),
      };
    });
    if (tooSimilar(options[0].question, options[1].question)) throw invalidRedraw();
  } catch (error) {
    await recordRedrawValidationFailure(input, response, payload, startedAt, costReservationId);
    throw error;
  }
  if (options.some((option) => input.rejectedQuestions.some((rejected) => tooSimilar(option.question, rejected)))) {
    await recordRedrawValidationFailure(input, response, payload, startedAt, costReservationId, "REPEATED_REJECTED_PATH");
    throw new RepositoryError(
      "RESEARCH_VALIDATION_FAILED",
      "The redraw repeated a path you already rejected. Nothing changed; please retry.",
      502,
      true,
    );
  }
  await recordOpenAIUsage({
    identityId: input.identityId,
    costReservationId,
    journeyId: input.journeyId,
    turnId: input.turn.id,
    modelId: input.modelId,
    operation: "question_redraw",
    purpose: "user_rejected_paths",
    outcome: "completed",
    response: payload,
    providerRequestId: response.headers.get("x-request-id"),
    httpStatus: response.status,
    latencyMs: Date.now() - startedAt,
    metadata: { adventure: input.adventure, hasLearnerNote: Boolean(input.reason) },
  });
  return {
    preferredPosition: parsed.preferredPosition === 1 ? 1 : 0,
    options,
  };
}

function buildRedrawInstructions(
  input: Parameters<typeof runLiveRedraw>[0],
  performer: ReturnType<typeof performerById>,
) {
  return [
    `CuriosityPedia prompt ${PROMPT_VERSION}. Generate only the next two curiosity paths.`,
    "The learner has just read the supplied visible text and may also have seen the supplied factual image.",
    `Use the loose ${performer.name} cue as an editorial selection lens (${performer.cue}), not as character roleplay.`,
    `Question posture: ${performer.questionPosture}`,
    "The learnerDirection field is the learner's explicit editorial request. When it is non-empty, follow it as the highest-priority direction for the replacement questions; it overrides the default adventure direction whenever they conflict.",
    "If learnerDirection asks about a concept, definition, foundational idea, or mechanism, at least one replacement question must directly express that request in clear beginner-friendly language. Questions such as 'What is this?', 'What does this mean?', 'Why does this happen?', and 'How does it work?' are valid when they name or clearly point to a concept introduced in the visible turn.",
    "Do not turn a direct learner request into a merely adjacent, more surprising, or more concrete question. Preserve the requested information gap. If the learner requests two distinct directions, reflect both; otherwise use the second option for a meaningfully different but closely relevant edge.",
    "Silently generate at least eight candidates across mechanism, boundary or failure, measurement, event or case, comparison, consequence, history of discovery, scale, concept, and foundational explanation before selecting two.",
    "Without a learnerDirection, reject candidates that are already answered, merely request more detail, mainly interest a specialist, depend on unexplained jargon, or could fit unrelated topics. A direct learnerDirection asking for a concept, definition, or explanation explicitly overrides any default rule against definition-style questions.",
    "Both questions must remain grounded in the visible text or image, feel meaningfully different, and avoid every rejected question and close paraphrase. They may target a concrete fact, object, creature, place, event, visible detail, concept, definition, principle, relationship, or mechanism.",
    "Write each question as a doorway for a curious beginner of any age who may be encountering the subject for the first time. They should not know the answer, but should immediately understand what the question is asking. Specialist terms are allowed when the learner explicitly asks about that term or when the question itself makes the term understandable.",
    "Make each one a playable rabbit hole with the natural-language length of 5–12 English words, using the output language's normal segmentation and syntax. Use plain everyday language, one idea at a time, and wording that is fun to say out loud. Ask what something is or means, what it does, why it happens, how it works, what it depends on, what might happen if it changed, or what it can be compared with.",
    ...(performer.id === "atlas" ? ["For Atlas, do not create hypothetical or counterfactual paths. Both options must stay attached to documented real subjects, events, concepts, principles, or observed phenomena."] : []),
    "Prefer concrete wonder, clear concepts, hidden mechanisms, vivid cause-and-effect, and small mysteries. Avoid academic framing, unexplained jargon, stacked clauses, vague abstraction, and quiz-like recall.",
    `Write both questions and angle labels in ${localeName(input.turn.metadata.outputLocale)} (${input.turn.metadata.outputLocale}).`,
    "Do not research, answer the questions, or mention this instruction. Return the required structured output only.",
  ].join("\n");
}

function buildRedrawInput(input: Parameters<typeof runLiveRedraw>[0]) {
  return {
    visibleTopic: input.turn.topicLabel,
    visibleText: input.turn.answerBlocks.map((block) => block.text),
    visibleImage: input.turn.media,
    rejectedQuestions: input.rejectedQuestions,
    desiredAdventure: input.adventure,
    defaultAdventureDirection: adventureDirection(input.adventure),
    learnerDirection: input.reason ?? null,
  };
}

function adventureDirection(value: number) {
  if (value <= 35) return "Practical: favor a useful, foundational, or directly explanatory path.";
  if (value >= 65) return "Surprising: favor an unexpected but well-grounded path.";
  return "Different direction: favor a distinct edge of the visible turn.";
}

async function recordRedrawValidationFailure(
  input: Parameters<typeof runLiveRedraw>[0],
  response: Response,
  payload: unknown,
  startedAt: number,
  costReservationId: string | undefined,
  errorCode = "SCHEMA_INVALID",
) {
  await recordOpenAIUsage({
    identityId: input.identityId,
    costReservationId,
    journeyId: input.journeyId,
    turnId: input.turn.id,
    modelId: input.modelId,
    operation: "question_redraw",
    purpose: "user_rejected_paths",
    outcome: "validation_failed",
    response: payload,
    providerRequestId: response.headers.get("x-request-id"),
    httpStatus: response.status,
    latencyMs: Date.now() - startedAt,
    errorCode,
    errorMessage: "Question redraw did not pass CuriosityPedia validation.",
    metadata: { adventure: input.adventure, hasLearnerNote: Boolean(input.reason) },
  });
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
    "The replacement questions did not pass CuriosityPedia’s relevance checks. Nothing changed; please retry.",
    502,
    true,
  );
}

export const liveRedrawTestHooks = {
  adventureDirection,
  buildRedrawInput,
  buildRedrawInstructions,
};
