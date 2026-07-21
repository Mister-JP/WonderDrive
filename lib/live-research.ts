import { MODELS, PERFORMERS, PROMPT_VERSION } from "./catalog";
import type {
  AnswerBlock,
  AnswerDensity,
  ImagePreference,
  ModelId,
  PerformerId,
  ResearchHandoff,
  ResearchEvent,
  ResearchPreset,
  SupportedLocale,
  Source,
  TurnMedia,
  Viewer,
} from "./contracts";
import { stableKey } from "./fixtures";
import { RepositoryError } from "./errors";
import {
  isRecord as isObject,
  OPENAI_PROMPT_LIMITS,
  outputText as extractOutputText,
  requestOpenAI,
  responseIncompleteReason,
  structuredOutput,
} from "./openai";
import { OPENAI_IMAGE_SEARCH_MAX_RESULTS } from "./research-config";
import { recordOpenAIUsage } from "./provider-usage";
import { reserveProviderCost } from "./provider-cost-control";
import { localeName } from "./i18n";
import {
  buildInstructions,
  buildResearchInput,
  densityVerbosity,
  KNOWLEDGE_CHECK_SCHEMA,
  turnSchemaForDensity,
} from "./research/prompt-policy";
import {
  countPageFetches,
  countWebSearchCalls,
  citationComparableUrl,
  dedupeSources,
  extractImages,
  extractSources,
  numberValue,
  parseModelTurn,
} from "./research/provider-response";
import { runProviderStream } from "./research/provider-stream";
import type {
  ModelTurn,
  ModelVisualNote,
  OpenAIResponse,
  ProviderImage,
  ProviderSource,
} from "./research/provider-response";
import {
  applyCitationRecovery,
  applyCitationRepair,
  applyImageNoteRepair,
  imagePreferenceForQuestion,
  imageNoteRepairFailure,
  invalidCitationIndexes,
  prioritizeTurnSources,
  pruneUnsupportedBlocks,
  repairImageNotesBySourcePath,
  normalizeGeneratedProse,
  validateMediaGallery,
  validateAndMapTurn,
  visualNoteCommentary,
} from "./research/turn-validation";
import type {
  CitationRecovery,
  CitationRepair,
  CitationRepairResult,
  ImageNoteRepair,
  TurnValidationDiagnostics,
} from "./research/turn-validation";

export type PreparedLiveResearch = {
  requestId: string;
  leaseToken: string;
  identityId: string;
  viewerMode: Viewer["mode"];
  providerAttempt?: number;
  kind: "create" | "advance";
  question: string;
  seed: string;
  depth: number;
  performerId: PerformerId;
  modelId: ModelId;
  researchPreset: ResearchPreset;
  answerDensity: AnswerDensity;
  imagePreference: ImagePreference;
  outputLocale: SupportedLocale;
  topicTrail: string[];
  journeyId?: string;
  fromTurnId?: string;
  sourcePageUrl?: string;
  selectedOptionId?: string;
  action?: "choose" | "delegate" | "explore";
  branched?: boolean;
  expectedVersion?: number;
  idempotencyKey: string;
  payloadHash: string;
};

export type LiveTurnDraft = {
  topicLabel: string;
  answer: string;
  answerBlocks: AnswerBlock[];
  media: TurnMedia[];
  transition: string;
  researchSummary: string;
  researchHandoff: ResearchHandoff;
  preferredPosition: 0 | 1;
  options: Array<{ question: string; angle: string }>;
  sources: Source[];
  researchEvents: ResearchEvent[];
  providerResponseId: string;
  usage: {
    inputTokens: number;
    cachedInputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    totalTokens: number;
    webSearchCalls: number;
    pageFetches: number;
    latencyMs: number;
    estimatedCostUsd: number;
    rateEffectiveAt: string;
  };
};

type ActivityEmitter = (event: ResearchEvent) => void;

// max_output_tokens is shared by hidden reasoning and visible output. These
// centralized limits leave room for both before schema validation begins.
const PRESET_LIMITS = OPENAI_PROMPT_LIMITS.liveResearch;

export const LIVE_RESEARCH_RESPONSE_INCLUDES = [
  "web_search_call.action.sources",
  "web_search_call.results",
] as const;

const LIVE_TURN_VALIDATION_DIAGNOSTICS: TurnValidationDiagnostics = {
  validationFailure: (detail) => console.error("CuriosityPedia live response validation failed", detail),
  citationMismatch: (detail) => console.error("CuriosityPedia citation mismatch", detail),
};


export async function runLiveResearch(
  prepared: PreparedLiveResearch,
  emit: ActivityEmitter,
  externalSignal?: AbortSignal,
  assertProviderAttempt: () => Promise<void> = async () => {},
): Promise<LiveTurnDraft> {
  await assertProviderAttempt();
  const limits = PRESET_LIMITS[prepared.researchPreset];
  const events: ResearchEvent[] = [];
  const startedAt = Date.now();
  let searchStarted = false;
  let synthesisStarted = false;

  const addActivity = (kind: ResearchEvent["kind"], label: string, sourceId: string | null = null) => {
    const event: ResearchEvent = {
      id: crypto.randomUUID(),
      sequence: events.length,
      kind,
      label,
      sourceId,
    };
    events.push(event);
    emit(event);
  };

  addActivity("status", `Prepared a ${prepared.researchPreset} foreground research run`);
  const streamed = await runProviderStream({
    requestBody: liveResearchRequestBody(prepared),
    timeoutMs: limits.timeoutMs,
    startedAt,
    usageContext: researchUsageContext(prepared),
    externalSignal,
    onProgress: (progress) => {
      if (progress.kind === "search" && !searchStarted) {
        searchStarted = true;
        addActivity("search", "OpenAI began a live web search for relevant evidence");
      }
      if (progress.kind === "output_delta" && !synthesisStarted) {
        synthesisStarted = true;
        addActivity("synthesis", "The performer began composing from the retrieved evidence");
      }
    },
  });
  const completedResponse = streamed.completedResponse;
  let outputText = streamed.outputText;
  if (!outputText) outputText = extractOutputText(completedResponse);

  return finalizeLiveResearchResponse(
    prepared,
    completedResponse,
    emit,
    externalSignal,
    assertProviderAttempt,
    { events, outputText, startedAt },
  );
}

export function liveResearchRequestBody(
  prepared: PreparedLiveResearch,
  { background = false }: { background?: boolean } = {},
) {
  const limits = PRESET_LIMITS[prepared.researchPreset];
  const performer = PERFORMERS.find((candidate) => candidate.id === prepared.performerId)!;
  return {
    model: prepared.modelId,
    instructions: buildInstructions(performer),
    input: buildResearchInput(prepared),
    tools: [prepared.imagePreference === "avoid"
      ? { type: "web_search" }
      : {
          type: "web_search",
          search_content_types: ["image", "text"],
          image_settings: { max_results: OPENAI_IMAGE_SEARCH_MAX_RESULTS, caption: true },
        }],
    tool_choice: "auto",
    include: prepared.imagePreference === "avoid"
      ? [LIVE_RESEARCH_RESPONSE_INCLUDES[0]]
      : [...LIVE_RESEARCH_RESPONSE_INCLUDES],
    max_tool_calls: limits.maxToolCalls,
    max_output_tokens: limits.maxOutputTokens,
    reasoning: { effort: limits.reasoning },
    text: structuredOutput(
      "curiositypedia_turn",
      turnSchemaForDensity(prepared.answerDensity),
      densityVerbosity(prepared.answerDensity),
    ),
    safety_identifier: `wd_${prepared.identityId}`.slice(0, 64),
    store: background,
    stream: !background,
    ...(background ? { background: true } : {}),
  };
}

export async function finalizeLiveResearchResponse(
  prepared: PreparedLiveResearch,
  completedResponse: OpenAIResponse,
  emit: ActivityEmitter = () => {},
  externalSignal?: AbortSignal,
  assertProviderAttempt: () => Promise<void> = async () => {},
  context: {
    events?: ResearchEvent[];
    outputText?: string;
    startedAt?: number;
    allowSupplemental?: boolean;
    maxVisualCurationAttempts?: number;
  } = {},
): Promise<LiveTurnDraft> {
  const events = context.events ?? [];
  const startedAt = context.startedAt ?? Date.now();
  const allowSupplemental = context.allowSupplemental ?? true;
  const maxVisualCurationAttempts = context.maxVisualCurationAttempts ?? 2;
  const addActivity = (kind: ResearchEvent["kind"], label: string, sourceId: string | null = null) => {
    const event: ResearchEvent = {
      id: crypto.randomUUID(),
      sequence: events.length,
      kind,
      label,
      sourceId,
    };
    events.push(event);
    emit(event);
  };
  if (!events.length) addActivity("status", "Retrieved completed background research for validation");
  const outputText = context.outputText || extractOutputText(completedResponse);

  let providerSources = extractSources(completedResponse);
  if (providerSources.length < 2) {
    throw validationFailure("The research run did not return enough inspectable web sources.");
  }

  providerSources.slice(0, 6).forEach((source) => {
    addActivity("source", `Consulted ${source.publisher}: ${source.title}`, stableKey(source.url));
  });
  addActivity("check", "Checked that citations resolve to sources consulted in this run");

  let providerImages = prepared.imagePreference === "avoid" ? [] : extractImages(completedResponse);
  const renderedImagePreference = imagePreferenceForQuestion(prepared.imagePreference, prepared.question);
  let modelTurn = parseModelTurn(
    outputText,
    validationFailure,
    (error) => console.error("OpenAI structured output was not JSON", error),
  );
  const supplementalResponses: OpenAIResponse[] = [];
  let initialMedia = validateMediaGallery(
    providerImages,
    normalizeGeneratedProse(modelTurn.topicLabel),
    modelTurn.visualNotes,
    prepared.outputLocale,
  );
  if (allowSupplemental && renderedImagePreference === "prefer" && initialMedia.length < 8) {
    addActivity("search", "Curating a broader set of evidence-grade images for the visual story");
    for (
      let curationAttempt = 0;
      curationAttempt < maxVisualCurationAttempts && initialMedia.length < 8;
      curationAttempt += 1
    ) {
      await assertProviderAttempt();
      try {
        const curated = await runVisualCuration(
          modelTurn,
          providerImages,
          prepared,
          curationAttempt,
          externalSignal,
        );
        supplementalResponses.push(curated.response);
        providerImages = dedupeProviderImages([...providerImages, ...extractImages(curated.response)]).slice(0, 30);
        providerSources = dedupeSources([...providerSources, ...extractSources(curated.response)]);
        modelTurn = {
          ...modelTurn,
          visualNotes: dedupeVisualNotes([...(modelTurn.visualNotes ?? []), ...curated.visualNotes]),
        };
        initialMedia = validateMediaGallery(
          providerImages,
          normalizeGeneratedProse(modelTurn.topicLabel),
          modelTurn.visualNotes,
          prepared.outputLocale,
        );
      } catch (curationError) {
        console.error("CuriosityPedia supplemental visual curation was not applied", {
          attempt: curationAttempt + 1,
          error: curationError instanceof Error ? curationError.name : "UNKNOWN_ERROR",
        });
      }
    }
    addActivity(
      "check",
      `Selected ${initialMedia.length} source-matched visual${initialMedia.length === 1 ? "" : "s"} for the finished session`,
    );
    const acceptedVisualSources = new Set(
      initialMedia.map((media) => citationComparableUrl(media.sourcePageUrl)).filter(Boolean),
    );
    modelTurn = {
      ...modelTurn,
      visualNotes: (modelTurn.visualNotes ?? [])
        .filter((note) => acceptedVisualSources.has(citationComparableUrl(note.sourcePageUrl)))
        .slice(0, 12),
    };
  }
  if (providerImages.length && (modelTurn.visualNotes?.length ?? 0) > 0 && !initialMedia.length) {
    addActivity("check", "Matched selected visual notes to the provider's factual image results");
    const deterministicRepair = repairImageNotesBySourcePath(modelTurn, providerImages, prepared.outputLocale);
    const deterministicMedia = validateMediaGallery(
      providerImages,
      normalizeGeneratedProse(deterministicRepair.topicLabel),
      deterministicRepair.visualNotes,
      prepared.outputLocale,
    );
    if (deterministicMedia.length) {
      modelTurn = deterministicRepair;
    } else if (allowSupplemental) {
      await assertProviderAttempt();
      try {
        const repaired = await runImageNoteRepair(modelTurn, providerImages, prepared, externalSignal);
        supplementalResponses.push(repaired.response);
        modelTurn = applyImageNoteRepair(modelTurn, providerImages, repaired.repair, prepared.outputLocale);
      } catch (repairError) {
        console.error("CuriosityPedia image-note association repair was not applied", {
          error: repairError instanceof Error ? repairError.name : "UNKNOWN_ERROR",
        });
      }
    }
  }
  let draft;
  try {
    draft = validateAndMapTurn(
      modelTurn,
      providerSources,
      renderedImagePreference,
      providerImages,
      prepared.outputLocale,
      LIVE_TURN_VALIDATION_DIAGNOSTICS,
    );
  } catch (error) {
    if (!(error instanceof RepositoryError) || error.code !== "CITATION_INVALID") throw error;
    addActivity("check", "A citation pointer did not match the consulted source set; repairing pointers once");
    const invalidIndexes = invalidCitationIndexes(modelTurn, providerSources);
    if (!allowSupplemental) {
      modelTurn = pruneUnsupportedBlocks(modelTurn, invalidIndexes);
      providerSources = prioritizeTurnSources(modelTurn, providerSources);
      addActivity("check", "Removed an unsupported answer block before saving the background result");
    } else {
      let repairResult: CitationRepairResult = { turn: modelTurn, unsupportedIndexes: invalidIndexes };
      try {
        await assertProviderAttempt();
        const repaired = await runCitationRepair(modelTurn, providerSources, prepared, externalSignal);
        supplementalResponses.push(repaired.response);
        repairResult = applyCitationRepair(modelTurn, providerSources, repaired.repair);
      } catch (repairError) {
        if (!(repairError instanceof RepositoryError) || repairError.code !== "CITATION_INVALID") {
          throw repairError;
        }
        console.error("CuriosityPedia citation pointer repair could not be applied; recovering evidence", {
          invalidBlocks: invalidIndexes.map((index) => index + 1),
        });
      }
      modelTurn = repairResult.turn;

      if (repairResult.unsupportedIndexes.length) {
        addActivity("search", "Checked the remaining claims against fresh supporting evidence");
        try {
          await assertProviderAttempt();
          const recovered = await runCitationRecovery(
            modelTurn,
            repairResult.unsupportedIndexes,
            prepared,
            externalSignal,
          );
          supplementalResponses.push(recovered.response);
          const recoverySources = extractSources(recovered.response);
          const expandedSources = dedupeSources([...providerSources, ...recoverySources]);
          modelTurn = applyCitationRecovery(
            modelTurn,
            expandedSources,
            repairResult.unsupportedIndexes,
            recovered.recovery,
          );
          providerSources = prioritizeTurnSources(modelTurn, expandedSources);
        } catch (recoveryError) {
          if (!(recoveryError instanceof RepositoryError) || recoveryError.code !== "CITATION_INVALID") {
            throw recoveryError;
          }
          console.error("CuriosityPedia targeted citation recovery failed; pruning unsupported blocks", {
            unsupportedBlocks: repairResult.unsupportedIndexes.map((index) => index + 1),
          });
          modelTurn = pruneUnsupportedBlocks(modelTurn, repairResult.unsupportedIndexes);
        }
      }
    }
    draft = validateAndMapTurn(
      modelTurn,
      providerSources,
      renderedImagePreference,
      providerImages,
      prepared.outputLocale,
      LIVE_TURN_VALIDATION_DIAGNOSTICS,
    );
    addActivity("check", "Revalidated the answer against the final consulted source set");
  }
  addActivity("synthesis", "Validated the sourced answer and exactly two distinct next paths");

  const responseUsages = [completedResponse, ...supplementalResponses].map((response) => response.usage ?? {});
  const webSearchCalls = [completedResponse, ...supplementalResponses]
    .reduce((total, response) => total + countWebSearchCalls(response), 0);
  const pageFetches = [completedResponse, ...supplementalResponses]
    .reduce((total, response) => total + countPageFetches(response), 0);
  const cachedInputTokens =
    responseUsages.reduce(
      (total, responseUsage) => total + numberValue(responseUsage.input_tokens_details?.cached_tokens),
      0,
    );
  const model = MODELS.find((candidate) => candidate.id === prepared.modelId)!;
  const inputTokens = responseUsages.reduce(
    (total, responseUsage) => total + numberValue(responseUsage.input_tokens),
    0,
  );
  const outputTokens = responseUsages.reduce(
    (total, responseUsage) => total + numberValue(responseUsage.output_tokens),
    0,
  );
  const estimatedCostUsd =
    ((Math.max(0, inputTokens - cachedInputTokens) * model.inputUsdPerMillion +
      cachedInputTokens * model.cachedInputUsdPerMillion +
      outputTokens * model.outputUsdPerMillion) /
      1_000_000) +
    webSearchCalls * model.searchUsdPerCall;
  return {
    ...draft,
    researchEvents: events,
    providerResponseId: stringValue(completedResponse.id) || crypto.randomUUID(),
    usage: {
      inputTokens,
      cachedInputTokens,
      outputTokens,
      reasoningTokens:
        responseUsages.reduce(
          (total, responseUsage) => total + numberValue(responseUsage.output_tokens_details?.reasoning_tokens),
          0,
        ),
      totalTokens: responseUsages.reduce(
        (total, responseUsage) => total + numberValue(responseUsage.total_tokens),
        0,
      ),
      webSearchCalls,
      pageFetches,
      latencyMs: Date.now() - startedAt,
      estimatedCostUsd,
      rateEffectiveAt: model.priceEffectiveAt,
    },
  };
}

function researchUsageContext(
  prepared: PreparedLiveResearch,
  diagnosticMetadata: Record<string, string | number | boolean | null> = {},
) {
  return {
    identityId: prepared.identityId,
    viewerMode: prepared.viewerMode ?? "guest",
    journeyId: prepared.journeyId,
    turnId: prepared.fromTurnId,
    researchRequestId: prepared.requestId,
    modelId: prepared.modelId,
    operation: "live_research" as const,
    purpose: prepared.kind === "create" ? "opening_turn" : "follow_up_turn",
    metadata: {
      preset: prepared.researchPreset,
      answerDensity: prepared.answerDensity,
      imagePreference: prepared.imagePreference,
      depth: prepared.depth,
      ...diagnosticMetadata,
    },
    callKey: providerCallKey(prepared, "live_research"),
  };
}

function supplementalUsageContext(
  prepared: PreparedLiveResearch,
  operation: "image_note_repair" | "citation_repair" | "citation_recovery",
  purpose: string,
  costReservationId?: string,
) {
  return {
    identityId: prepared.identityId,
    journeyId: prepared.journeyId,
    turnId: prepared.fromTurnId,
    researchRequestId: prepared.requestId,
    modelId: prepared.modelId,
    operation,
    purpose,
    costReservationId,
    metadata: { depth: prepared.depth, preset: prepared.researchPreset },
  };
}

function providerCallKey(prepared: PreparedLiveResearch, operation: string) {
  return `${prepared.requestId}:${prepared.providerAttempt ?? 0}:${operation}`;
}

const VISUAL_NOTE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["visualNotes"],
  properties: {
    visualNotes: {
      type: "array",
      minItems: 8,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sourcePageUrl", "title", "role", "commentary", "evidenceRelation", "knowledgeCheck"],
        properties: {
          sourcePageUrl: { type: "string", minLength: 6, maxLength: 2_458 },
          title: { type: "string", minLength: 3, maxLength: 116 },
          role: { type: "string", enum: ["phenomenon", "mechanism", "scale", "anchor", "comparison", "object", "process", "result", "context", "primary-source"] },
          commentary: { type: "string", minLength: 40, maxLength: 520 },
          evidenceRelation: { type: "string", enum: ["shows", "illustrates", "contextualizes", "supports"] },
          knowledgeCheck: KNOWLEDGE_CHECK_SCHEMA,
        },
      },
    },
  },
} as const;

async function runVisualCuration(
  modelTurn: ModelTurn,
  existingImages: ProviderImage[],
  prepared: PreparedLiveResearch,
  curationAttempt: number,
  externalSignal?: AbortSignal,
): Promise<{ visualNotes: ModelVisualNote[]; response: OpenAIResponse }> {
  const limits = OPENAI_PROMPT_LIMITS.visualCuration;
  const startedAt = Date.now();
  const streamed = await runProviderStream({
    requestBody: {
      model: prepared.modelId,
      instructions: [
        `CuriosityPedia prompt ${PROMPT_VERSION}. Act only as a visual editor for an encyclopedia-grade knowledge session.`,
        "VISUAL QUALITY GATE",
        "Search an oversized pool of at least 20 plausible images before selecting 8–12.",
        "Judge the actual visible image or thumbnail—not merely its caption, filename, source reputation, or topical relevance. Keep an image only if it is visually compelling at the intended display size and the important subject is immediately legible.",
        "Silently reject any candidate that:",
        "- is low-resolution, blurry, badly compressed, watermarked, poorly cropped, or visibly dated web graphics;",
        "- contains important text in a language different from the reader output language;",
        "- is a text-heavy infographic whose labels cannot be comfortably read;",
        "- is merely relevant rather than visually interesting;",
        "- substantially duplicates the subject, viewpoint, composition, or teaching value of another selected image;",
        "- requires the commentary to explain what the reader cannot actually see;",
        "- fails to render or does not expose a usable direct image asset.",
        "Prefer images with strong composition, clear subjects, rich visible detail, trustworthy provenance, and an exact feature worth pausing to inspect. Visual excellence is an acceptance requirement, not a preference.",
        "Issue at least six focused image searches, not one broad query. Search separately for an orientation hero, the phenomenon, mechanism or process, scale, comparison, physical context, an illuminating object or detail, and primary-source or institutional evidence when available.",
        "Return 8–12 distinct factual images. Prefer high-resolution, legible, aesthetically strong photography, diagrams, maps, specimens, archival records, and institutional media. Never fill the quota with weak, decorative, near-duplicate, watermarked, or merely topical images; change the query until you have eight strong candidates.",
        "Every visual note must correspond to an image result actually returned during this call. Copy its source website URL exactly into sourcePageUrl. Do not invent URLs or describe details that are not visible in the image result and caption.",
        "Give one image the anchor role so it can serve as the dominant hero. Give every other image a distinct editorial job. Avoid any source URLs listed as already accepted.",
        `Write titles and commentary in ${localeName(prepared.outputLocale)} (${prepared.outputLocale}). Commentary must be one natural 45–85 word paragraph that says what is visible, what to notice, and why it changes or sharpens the reader's mental model.`,
        "For every visual note, create exactly one knowledgeCheck object. Its question is the single canonical image question reused in the projector, answer choices, result card, Journey Map, and child turn.",
        "Write that question as a short, direct, open-ended curiosity inspired by looking at the image, usually 4–12 plain words and one idea. It must invite wondering, not ask whether the learner understood the reading or test recall.",
        "Good shapes include 'Why are there so many tiny root tips?' and 'Why does this root tangle look so dense?' Never mention an encyclopedia, answer, page, panel, lesson, knowledge check, understanding, option, or choice. Never use 'according to', 'do you understand', 'which choice', 'which option', 'best matches', or 'what does this image show'. Do not generate a separate declaration or curiosity question.",
        "Every selected image must have a distinct question in both subject and wording. Never repeat or lightly paraphrase another image's question; if two images invite the same question, keep the stronger image and replace the other image.",
        "Do not ask the same kind of question more than once in a session.",
        "Across the session, use some visible details as doorways into surprising adjacent topics—such as history, materials, craft, ecology, culture, or physics—so the questions expand beyond the starting subject instead of all staying narrowly focused on what the object looks like.",
        "Give exactly eight clear options answering that same curiosity question and exactly one unambiguously correct option. Use meaningful plausible alternatives, not tricks, obscure trivia, near-duplicates, all/none-of-the-above, or an I-don't-know option.",
        "Keep the options grounded in the supplied answer, image result, caption, and visible evidence. Briefly explain the correct option without mentioning the encyclopedia or shaming an incorrect choice.",
      ].join("\n"),
      input: JSON.stringify({
        question: prepared.question,
        topicLabel: modelTurn.topicLabel,
        answer: modelTurn.answerBlocks.slice(0, 5).map((block) => block.text),
        alreadyAcceptedSourcePageUrls: existingImages.map((image) => image.sourcePageUrl).slice(0, 12),
      }),
      tools: [{
        type: "web_search",
        search_content_types: ["image", "text"],
        image_settings: { max_results: 10, caption: true },
      }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources", "web_search_call.results"],
      max_tool_calls: limits.maxToolCalls,
      max_output_tokens: limits.maxOutputTokens,
      reasoning: { effort: limits.reasoning },
      text: structuredOutput("curiositypedia_visual_curation", VISUAL_NOTE_SCHEMA, "medium"),
      safety_identifier: `wd_visual_${prepared.identityId}`.slice(0, 64),
      store: false,
      stream: true,
    },
    timeoutMs: limits.timeoutMs,
    startedAt,
    usageContext: {
      ...researchUsageContext(prepared, { phase: "visual_curation", curationAttempt: curationAttempt + 1 }),
      purpose: "visual_curation_shortfall",
      callKey: providerCallKey(prepared, `visual_curation_${curationAttempt + 1}`),
    },
    externalSignal,
  });
  const response = streamed.completedResponse;
  const text = streamed.outputText || extractOutputText(response);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw validationFailure("The visual curator returned invalid structured output.");
  }
  if (!isObject(parsed) || !Array.isArray(parsed.visualNotes)) {
    throw validationFailure("The visual curator returned an invalid visual collection.");
  }
  return { visualNotes: parsed.visualNotes as ModelVisualNote[], response };
}

function dedupeProviderImages(images: ProviderImage[]): ProviderImage[] {
  const seenImages = new Set<string>();
  const seenSources = new Set<string>();
  return images.filter((image) => {
    if (seenImages.has(image.imageUrl) || seenSources.has(image.sourcePageUrl)) return false;
    seenImages.add(image.imageUrl);
    seenSources.add(image.sourcePageUrl);
    return true;
  });
}

function dedupeVisualNotes(notes: ModelVisualNote[]): ModelVisualNote[] {
  const seen = new Set<string>();
  return notes.filter((note) => {
    if (!note || typeof note.sourcePageUrl !== "string" || seen.has(note.sourcePageUrl)) return false;
    seen.add(note.sourcePageUrl);
    return true;
  });
}


async function runImageNoteRepair(
  modelTurn: ModelTurn,
  providerImages: ProviderImage[],
  prepared: PreparedLiveResearch,
  externalSignal?: AbortSignal,
): Promise<{ repair: ImageNoteRepair; response: OpenAIResponse }> {
  const images = providerImages.slice(0, 12);
  const notes = (modelTurn.visualNotes ?? []).slice(0, 12);
  const imageIds = images.map((_, index) => `I${index + 1}`);
  const noteNumbers = notes.map((_, index) => index + 1);
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["notes"],
    properties: {
      notes: {
        type: "array",
        minItems: 0,
        maxItems: Math.min(images.length, notes.length),
        items: {
          type: "object",
          additionalProperties: false,
          required: ["imageId", "noteNumber", "title", "role", "commentary", "evidenceRelation"],
          properties: {
            imageId: { type: "string", enum: imageIds },
            noteNumber: { type: "integer", enum: noteNumbers },
            title: { type: "string", minLength: 3, maxLength: 116 },
            role: { type: "string", enum: ["phenomenon", "mechanism", "scale", "anchor", "comparison", "object", "process", "result", "context", "primary-source"] },
            commentary: { type: "string", minLength: 40, maxLength: 520 },
            evidenceRelation: { type: "string", enum: ["shows", "illustrates", "contextualizes", "supports"] },
          },
        },
      },
    },
  } as const;
  const startedAt = Date.now();
  let usageRecorded = false;
  let costReservationId: string | undefined;
  const controller = new AbortController();
  const abortFromClient = () => controller.abort("CuriosityPedia client disconnected");
  externalSignal?.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(
    () => controller.abort("CuriosityPedia image-note repair timeout"),
    OPENAI_PROMPT_LIMITS.imageNoteRepair.timeoutMs,
  );
  const requestBody = {
      model: prepared.modelId,
      instructions: [
        `CuriosityPedia prompt ${PROMPT_VERSION}. Associate already-written visual notes with already-retrieved factual image results.`,
        "Do not browse, rewrite, summarize, or invent visual details.",
        "Return a note only when one supplied visual note clearly describes one supplied image caption or source page. Never match by broad topic alone.",
        "Each imageId and noteNumber may appear at most once. Omit uncertain matches.",
        "The server owns imageId values; copy them exactly instead of returning URLs.",
        `Write repaired reader-facing fields in ${localeName(prepared.outputLocale)} (${prepared.outputLocale}). Preserve the supplied note's visible claims. Write commentary as one natural paragraph of 45–85 English words: locate exactly what is shown, point out one or two visible details, decode what they mean physically, and connect them to the changed answer or mental model. Use no headings, labels, lists, field names, numbered sections, or references to answer blocks; follow the output language's normal segmentation and syntax.`,
        "Assign exactly one primary image job: phenomenon, mechanism, scale, anchor, comparison, object, process, result, context, or primary-source.",
        "Include at least one concrete subject term from the matched image caption in the repaired title or prose. Never add a detail absent from the supplied note and caption.",
      ].join("\n"),
      input: JSON.stringify({
        imageResults: images.map((image, index) => ({
          imageId: imageIds[index],
          caption: image.caption,
          sourcePageUrl: image.sourcePageUrl,
        })),
        visualNotes: notes.map((note, index) => ({
          noteNumber: index + 1,
          sourcePageUrl: note.sourcePageUrl,
          title: note.title,
          commentary: visualNoteCommentary(note),
        })),
      }),
      max_output_tokens: OPENAI_PROMPT_LIMITS.imageNoteRepair.maxOutputTokens,
      reasoning: { effort: OPENAI_PROMPT_LIMITS.imageNoteRepair.reasoning },
      text: structuredOutput("curiositypedia_image_note_repair", schema),
      safety_identifier: `wd_image_repair_${prepared.identityId}`.slice(0, 64),
      store: false,
  };
  try {
    const reservation = await reserveProviderCost({
      callKey: providerCallKey(prepared, "image_note_repair"),
      identityId: prepared.identityId,
      viewerMode: prepared.viewerMode ?? "guest",
      modelId: prepared.modelId,
      operation: "image_note_repair",
      requestBody,
      researchRequestId: prepared.requestId,
      journeyId: prepared.journeyId,
      turnId: prepared.fromTurnId,
    });
    costReservationId = reservation.id;
    const response = await requestOpenAI(requestBody, { signal: controller.signal });
    if (!response.ok) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "image_note_repair", "image_source_url_mismatch", costReservationId),
        outcome: "http_error",
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: `HTTP_${response.status}`,
        errorMessage: "Image-note repair provider request was rejected.",
      });
      throw imageNoteRepairFailure();
    }
    const payload = (await response.json()) as OpenAIResponse;
    const incompleteReason = responseIncompleteReason(payload);
    if (incompleteReason) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "image_note_repair", "image_source_url_mismatch", costReservationId),
        outcome: "incomplete",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: incompleteReason === "max_output_tokens" ? "OUTPUT_LIMIT" : "INCOMPLETE",
        errorMessage: `Image-note repair ended incomplete (${incompleteReason}).`,
      });
      throw imageNoteRepairFailure();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractOutputText(payload));
    } catch {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "image_note_repair", "image_source_url_mismatch", costReservationId),
        outcome: "validation_failed",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: "SCHEMA_INVALID",
        errorMessage: "Image-note repair returned invalid structured output.",
      });
      throw imageNoteRepairFailure();
    }
    if (!isObject(parsed) || !Array.isArray(parsed.notes)) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "image_note_repair", "image_source_url_mismatch", costReservationId),
        outcome: "validation_failed",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: "SCHEMA_INVALID",
        errorMessage: "Image-note repair returned an invalid note collection.",
      });
      throw imageNoteRepairFailure();
    }
    const repair = parsed as ImageNoteRepair;
    applyImageNoteRepair(modelTurn, providerImages, repair, prepared.outputLocale);
    usageRecorded = true;
    await recordOpenAIUsage({
      ...supplementalUsageContext(prepared, "image_note_repair", "image_source_url_mismatch", costReservationId),
      outcome: "completed",
      response: payload,
      providerRequestId: response.headers.get("x-request-id"),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      metadata: { providerImageCount: images.length, visualNoteCount: notes.length, matchedCount: repair.notes.length },
    });
    return { repair, response: payload };
  } catch (error) {
    if (!usageRecorded && costReservationId) {
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "image_note_repair", "image_source_url_mismatch", costReservationId),
        outcome: "transport_error",
        latencyMs: Date.now() - startedAt,
        errorCode: controller.signal.aborted ? "ABORTED" : error instanceof Error ? error.name : "UNKNOWN_ERROR",
        errorMessage: controller.signal.aborted
          ? String(controller.signal.reason ?? "Image-note repair was aborted.")
          : error instanceof Error ? error.message : "Image-note repair was interrupted.",
      });
    }
    if (error instanceof RepositoryError) throw error;
    throw imageNoteRepairFailure();
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromClient);
  }
}

async function runCitationRepair(
  modelTurn: ModelTurn,
  providerSources: ProviderSource[],
  prepared: PreparedLiveResearch,
  externalSignal?: AbortSignal,
): Promise<{ repair: CitationRepair; response: OpenAIResponse }> {
  const startedAt = Date.now();
  let usageRecorded = false;
  let costReservationId: string | undefined;
  const sourceIds = providerSources.map((_, index) => `S${index + 1}`);
  const blockCount = Math.min(5, modelTurn.answerBlocks.length);
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        minItems: blockCount,
        maxItems: blockCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["sourceIds", "unsupported"],
          properties: {
            sourceIds: {
              type: "array",
              minItems: 0,
              maxItems: 4,
              items: { type: "string", enum: sourceIds },
            },
            unsupported: { type: "boolean" },
          },
        },
      },
    },
  } as const;
  const controller = new AbortController();
  const abortFromClient = () => controller.abort("CuriosityPedia client disconnected");
  externalSignal?.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(
    () => controller.abort("CuriosityPedia citation repair timeout"),
    OPENAI_PROMPT_LIMITS.citationRepair.timeoutMs,
  );
  const requestBody = {
        model: prepared.modelId,
        instructions: [
          `CuriosityPedia prompt ${PROMPT_VERSION}. Repair citation pointers for an already-written answer.`,
          "Do not rewrite, summarize, expand, or evaluate the prose. Do not browse the web.",
          "For each answer block, return only IDs from the supplied consulted-source list that genuinely support that block.",
          "Preserve block order. If none of the supplied sources clearly supports a block, return an empty sourceIds array and set unsupported to true. Never guess.",
        ].join("\n"),
        input: JSON.stringify({
          answerBlocks: modelTurn.answerBlocks.slice(0, blockCount).map((block, index) => ({
            block: index + 1,
            text: block.text,
            originalCitationUrls: block.citationUrls,
          })),
          consultedSources: providerSources.map((source, index) => ({
            id: sourceIds[index],
            title: source.title,
            publisher: source.publisher,
            url: source.url,
          })),
        }),
        max_output_tokens: OPENAI_PROMPT_LIMITS.citationRepair.maxOutputTokens,
        reasoning: { effort: OPENAI_PROMPT_LIMITS.citationRepair.reasoning },
        text: structuredOutput("curiositypedia_citation_repair", schema),
        safety_identifier: `wd_repair_${prepared.identityId}`.slice(0, 64),
        store: false,
  };
  try {
    const reservation = await reserveProviderCost({
      callKey: providerCallKey(prepared, "citation_repair"),
      identityId: prepared.identityId,
      viewerMode: prepared.viewerMode ?? "guest",
      modelId: prepared.modelId,
      operation: "citation_repair",
      requestBody,
      researchRequestId: prepared.requestId,
      journeyId: prepared.journeyId,
      turnId: prepared.fromTurnId,
    });
    costReservationId = reservation.id;
    const response = await requestOpenAI(requestBody, { signal: controller.signal });
    if (!response.ok) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_repair", "citation_pointer_mismatch", costReservationId),
        outcome: "http_error",
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: `HTTP_${response.status}`,
        errorMessage: "Citation repair provider request was rejected.",
      });
      console.error("CuriosityPedia citation repair request failed", {
        status: response.status,
        requestId: response.headers.get("x-request-id"),
      });
      throw citationRepairFailure();
    }
    const payload = (await response.json()) as OpenAIResponse;
    const incompleteReason = responseIncompleteReason(payload);
    if (incompleteReason) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_repair", "citation_pointer_mismatch", costReservationId),
        outcome: "incomplete",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: incompleteReason === "max_output_tokens" ? "OUTPUT_LIMIT" : "INCOMPLETE",
        errorMessage: `Citation repair ended incomplete (${incompleteReason}).`,
      });
      throw citationRepairFailure();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractOutputText(payload));
    } catch {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_repair", "citation_pointer_mismatch", costReservationId),
        outcome: "validation_failed",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: "SCHEMA_INVALID",
        errorMessage: "Citation repair returned invalid structured output.",
      });
      throw citationRepairFailure();
    }
    if (!isObject(parsed) || !Array.isArray(parsed.blocks)) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_repair", "citation_pointer_mismatch", costReservationId),
        outcome: "validation_failed",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: "SCHEMA_INVALID",
        errorMessage: "Citation repair returned an invalid block collection.",
      });
      throw citationRepairFailure();
    }
    usageRecorded = true;
    await recordOpenAIUsage({
      ...supplementalUsageContext(prepared, "citation_repair", "citation_pointer_mismatch", costReservationId),
      outcome: "completed",
      response: payload,
      providerRequestId: response.headers.get("x-request-id"),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
    });
    return { repair: parsed as CitationRepair, response: payload };
  } catch (error) {
    if (!usageRecorded && costReservationId) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_repair", "citation_pointer_mismatch", costReservationId),
        outcome: "transport_error",
        latencyMs: Date.now() - startedAt,
        errorCode: controller.signal.aborted ? "ABORTED" : error instanceof Error ? error.name : "UNKNOWN_ERROR",
        errorMessage: controller.signal.aborted
          ? String(controller.signal.reason ?? "Citation repair was aborted.")
          : error instanceof Error ? error.message : "Citation repair was interrupted.",
      });
    }
    if (error instanceof RepositoryError) throw error;
    console.error("CuriosityPedia citation repair was interrupted", error);
    throw citationRepairFailure();
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromClient);
  }
}

async function runCitationRecovery(
  modelTurn: ModelTurn,
  unsupportedIndexes: number[],
  prepared: PreparedLiveResearch,
  externalSignal?: AbortSignal,
): Promise<{ recovery: CitationRecovery; response: OpenAIResponse }> {
  const startedAt = Date.now();
  let usageRecorded = false;
  let costReservationId: string | undefined;
  const blockCount = unsupportedIndexes.length;
  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["blocks"],
    properties: {
      blocks: {
        type: "array",
        minItems: blockCount,
        maxItems: blockCount,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["block", "text", "citationUrls"],
          properties: {
            block: { type: "integer", enum: unsupportedIndexes.map((index) => index + 1) },
            text: { type: "string", minLength: 64, maxLength: 1_080 },
            citationUrls: {
              type: "array",
              minItems: 1,
              maxItems: 4,
              items: { type: "string", minLength: 6, maxLength: 2_458 },
            },
          },
        },
      },
    },
  } as const;
  const controller = new AbortController();
  const abortFromClient = () => controller.abort("CuriosityPedia client disconnected");
  externalSignal?.addEventListener("abort", abortFromClient, { once: true });
  const timeout = setTimeout(
    () => controller.abort("CuriosityPedia citation recovery timeout"),
    OPENAI_PROMPT_LIMITS.citationRecovery.timeoutMs,
  );
  const requestBody = {
      model: prepared.modelId,
      instructions: [
        `CuriosityPedia prompt ${PROMPT_VERSION}. Recover evidence for unsupported answer blocks.`,
        "Search the web for reliable support, then rewrite only the supplied blocks so every factual claim is supported by the exact consulted URLs returned in citationUrls.",
        "Choose sources for what they are qualified to establish. Prefer original or authoritative evidence for factual claims and reputable independent sources for explanation and context. Cross-check claims that are current, surprising, or contested.",
        "Preserve each block number and its role in the answer. Do not change any block that was not supplied.",
        "Write for a curious learner with no assumed specialist knowledge, explaining unavoidable jargon naturally without talking down to them. Never invent a URL or cite a search result that you did not consult.",
        `Write the recovered prose in ${localeName(prepared.outputLocale)} (${prepared.outputLocale}). Search may use sources in any language.`,
      ].join("\n"),
      input: JSON.stringify({
        question: prepared.question,
        blocks: unsupportedIndexes.map((index) => ({
          block: index + 1,
          text: modelTurn.answerBlocks[index]?.text ?? "",
        })),
      }),
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      include: ["web_search_call.action.sources"],
      max_tool_calls: Math.min(4, Math.max(2, blockCount * 2)),
      max_output_tokens: OPENAI_PROMPT_LIMITS.citationRecovery.maxOutputTokens,
      reasoning: { effort: OPENAI_PROMPT_LIMITS.citationRecovery.reasoning },
      text: structuredOutput("curiositypedia_citation_recovery", schema),
      safety_identifier: `wd_recovery_${prepared.identityId}`.slice(0, 64),
      store: false,
  };
  try {
    const reservation = await reserveProviderCost({
      callKey: providerCallKey(prepared, "citation_recovery"),
      identityId: prepared.identityId,
      viewerMode: prepared.viewerMode ?? "guest",
      modelId: prepared.modelId,
      operation: "citation_recovery",
      requestBody,
      researchRequestId: prepared.requestId,
      journeyId: prepared.journeyId,
      turnId: prepared.fromTurnId,
    });
    costReservationId = reservation.id;
    const response = await requestOpenAI(requestBody, { signal: controller.signal });
    if (!response.ok) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_recovery", "unsupported_claim_recovery", costReservationId),
        outcome: "http_error",
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: `HTTP_${response.status}`,
        errorMessage: "Citation recovery provider request was rejected.",
      });
      console.error("CuriosityPedia citation recovery request failed", {
        status: response.status,
        requestId: response.headers.get("x-request-id"),
      });
      throw citationRepairFailure();
    }
    const payload = (await response.json()) as OpenAIResponse;
    const incompleteReason = responseIncompleteReason(payload);
    if (incompleteReason) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_recovery", "unsupported_claim_recovery", costReservationId),
        outcome: "incomplete",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: incompleteReason === "max_output_tokens" ? "OUTPUT_LIMIT" : "INCOMPLETE",
        errorMessage: `Citation recovery ended incomplete (${incompleteReason}).`,
      });
      throw citationRepairFailure();
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(extractOutputText(payload));
    } catch {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_recovery", "unsupported_claim_recovery", costReservationId),
        outcome: "validation_failed",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: "SCHEMA_INVALID",
        errorMessage: "Citation recovery returned invalid structured output.",
      });
      throw citationRepairFailure();
    }
    if (!isObject(parsed) || !Array.isArray(parsed.blocks)) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_recovery", "unsupported_claim_recovery", costReservationId),
        outcome: "validation_failed",
        response: payload,
        providerRequestId: response.headers.get("x-request-id"),
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: "SCHEMA_INVALID",
        errorMessage: "Citation recovery returned an invalid block collection.",
      });
      throw citationRepairFailure();
    }
    usageRecorded = true;
    await recordOpenAIUsage({
      ...supplementalUsageContext(prepared, "citation_recovery", "unsupported_claim_recovery", costReservationId),
      outcome: "completed",
      response: payload,
      providerRequestId: response.headers.get("x-request-id"),
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
    });
    return { recovery: parsed as CitationRecovery, response: payload };
  } catch (error) {
    if (!usageRecorded && costReservationId) {
      usageRecorded = true;
      await recordOpenAIUsage({
        ...supplementalUsageContext(prepared, "citation_recovery", "unsupported_claim_recovery", costReservationId),
        outcome: "transport_error",
        latencyMs: Date.now() - startedAt,
        errorCode: controller.signal.aborted ? "ABORTED" : error instanceof Error ? error.name : "UNKNOWN_ERROR",
        errorMessage: controller.signal.aborted
          ? String(controller.signal.reason ?? "Citation recovery was aborted.")
          : error instanceof Error ? error.message : "Citation recovery was interrupted.",
      });
    }
    if (error instanceof RepositoryError) throw error;
    console.error("CuriosityPedia citation recovery was interrupted", error);
    throw citationRepairFailure();
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromClient);
  }
}

function citationRepairFailure() {
  return new RepositoryError(
    "CITATION_INVALID",
    "The live answer could not retain enough verified citations after automatic recovery. Nothing was saved; please retry.",
    502,
    true,
  );
}

function validationFailure(
  detail: string,
  code: "SCHEMA_INVALID" | "CITATION_INVALID" = "SCHEMA_INVALID",
) {
  console.error("CuriosityPedia live response validation failed", detail);
  return new RepositoryError(
    code,
    code === "CITATION_INVALID"
      ? "The live answer cited evidence that was not in its consulted sources. Nothing was saved; please retry."
      : "The live answer could not be formatted safely after applying CuriosityPedia’s 20% tolerance. Nothing was saved; please retry.",
    502,
    true,
  );
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
