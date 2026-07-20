import type {
  AnswerBlock,
  ImagePreference,
  ResearchHandoff,
  Source,
  SupportedLocale,
  TurnMedia,
} from "../contracts";
import { standaloneKnowledgeQuestion } from "../knowledge-check-contracts";
import { RepositoryError } from "../errors";
import { stableKey } from "../fixtures";
import { usesCompactWordSegmentation } from "../i18n";
import {
  canonicalUrl,
  citationComparableUrl,
  dedupeSources,
  isProviderRecord,
  matchSource,
  stringValue,
} from "./provider-response";
import type {
  ModelTurn,
  ModelVisualNote,
  ProviderImage,
  ProviderSource,
} from "./provider-response";

export type CitationRepair = {
  blocks: Array<{ sourceIds: string[]; unsupported: boolean }>;
};

export type CitationRecovery = {
  blocks: Array<{ block: number; text: string; citationUrls: string[] }>;
};

export type ImageNoteRepair = {
  notes: Array<{
    imageId: string;
    noteNumber: number;
    title: string;
    role: ModelVisualNote["role"];
    commentary: string;
    evidenceRelation: ModelVisualNote["evidenceRelation"];
  }>;
};

export type CitationRepairResult = {
  turn: ModelTurn;
  unsupportedIndexes: number[];
};

export type TurnValidationDiagnostics = {
  validationFailure?: (detail: string) => void;
  citationMismatch?: (detail: {
    block: number;
    citedUrls: string[];
    consultedUrls: string[];
  }) => void;
};

export function applyImageNoteRepair(
  modelTurn: ModelTurn,
  providerImages: ProviderImage[],
  repair: ImageNoteRepair,
  outputLocale: SupportedLocale = "en",
): ModelTurn {
  const notes = modelTurn.visualNotes ?? [];
  if (!Array.isArray(repair.notes) || repair.notes.length > Math.min(providerImages.length, notes.length, 12)) {
    throw imageNoteRepairFailure();
  }
  const usedImages = new Set<number>();
  const usedNotes = new Set<number>();
  const repairedNotes: ModelVisualNote[] = [];
  for (const match of repair.notes) {
    if (!isProviderRecord(match) || typeof match.imageId !== "string" || typeof match.noteNumber !== "number") {
      throw imageNoteRepairFailure();
    }
    const imageMatch = /^I([1-9]|1[0-2])$/.exec(match.imageId);
    const imageIndex = imageMatch ? Number(imageMatch[1]) - 1 : -1;
    const noteIndex = match.noteNumber - 1;
    if (
      imageIndex < 0 || imageIndex >= providerImages.length || noteIndex < 0 || noteIndex >= notes.length
      || !Number.isInteger(match.noteNumber) || usedImages.has(imageIndex) || usedNotes.has(noteIndex)
    ) {
      throw imageNoteRepairFailure();
    }
    if (
      !["phenomenon", "mechanism", "scale", "anchor", "comparison", "object", "process", "result", "context", "primary-source"].includes(stringValue(match.role))
      || !["shows", "illustrates", "contextualizes", "supports"].includes(stringValue(match.evidenceRelation))
    ) {
      throw imageNoteRepairFailure();
    }
    usedImages.add(imageIndex);
    usedNotes.add(noteIndex);
    const repairedNote: ModelVisualNote = {
      sourcePageUrl: providerImages[imageIndex].sourcePageUrl,
      title: stringValue(match.title),
      role: match.role as ModelVisualNote["role"],
      commentary: stringValue(match.commentary),
      evidenceRelation: match.evidenceRelation as ModelVisualNote["evidenceRelation"],
      ...(notes[noteIndex].curiosityQuestion ? { curiosityQuestion: notes[noteIndex].curiosityQuestion } : {}),
      ...(notes[noteIndex].knowledgeCheck ? { knowledgeCheck: notes[noteIndex].knowledgeCheck } : {}),
    };
    if (!isSpecificVisualNote(repairedNote, providerImages[imageIndex].caption, outputLocale)) {
      throw imageNoteRepairFailure();
    }
    repairedNotes.push(repairedNote);
  }
  return { ...modelTurn, visualNotes: repairedNotes };
}

export function repairImageNotesBySourcePath(
  modelTurn: ModelTurn,
  providerImages: ProviderImage[],
  outputLocale: SupportedLocale = "en",
): ModelTurn {
  const usedImages = new Set<number>();
  const repairedNotes: ModelVisualNote[] = [];
  for (const note of modelTurn.visualNotes ?? []) {
    const noteUrl = canonicalUrl(note.sourcePageUrl);
    if (!noteUrl) continue;
    const parsedNoteUrl = new URL(noteUrl);
    const noteHost = parsedNoteUrl.hostname.toLowerCase().replace(/^www\./, "");
    const noteTerms = urlPathTerms(parsedNoteUrl);
    const candidates = providerImages
      .map((image, index) => {
        const imageUrl = canonicalUrl(image.sourcePageUrl);
        if (!imageUrl || usedImages.has(index)) return null;
        const parsedImageUrl = new URL(imageUrl);
        const imageHost = parsedImageUrl.hostname.toLowerCase().replace(/^www\./, "");
        if (imageHost !== noteHost) return null;
        const imageTerms = urlPathTerms(parsedImageUrl);
        const overlap = [...noteTerms].filter((term) => imageTerms.has(term)).length;
        const score = overlap / Math.max(noteTerms.size, imageTerms.size, 1);
        return { image, index, overlap, score };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
      .sort((left, right) => right.score - left.score || right.overlap - left.overlap);
    const best = candidates[0];
    const runnerUp = candidates[1];
    if (!best || best.overlap < 2 || best.score < 0.5 || (runnerUp && runnerUp.score === best.score)) continue;
    const repaired = { ...note, sourcePageUrl: best.image.sourcePageUrl };
    if (!isSpecificVisualNote(repaired, best.image.caption, outputLocale)) continue;
    usedImages.add(best.index);
    repairedNotes.push(repaired);
  }
  return repairedNotes.length ? { ...modelTurn, visualNotes: repairedNotes } : modelTurn;
}

function urlPathTerms(url: URL) {
  let pathname = url.pathname;
  try {
    pathname = decodeURIComponent(pathname);
  } catch {
    // Keep the encoded path when a provider returns malformed percent escapes.
  }
  return new Set(
    pathname
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 3 && !["html", "htm", "index", "photo", "photos", "image", "images"].includes(term)),
  );
}

export function applyCitationRepair(
  modelTurn: ModelTurn,
  providerSources: ProviderSource[],
  repair: CitationRepair,
): CitationRepairResult {
  const blockCount = Math.min(5, modelTurn.answerBlocks.length);
  if (!Array.isArray(repair.blocks) || repair.blocks.length !== blockCount) throw citationRepairFailure();
  const unsupportedIndexes: number[] = [];
  const answerBlocks = modelTurn.answerBlocks.map((block, index) => {
    if (index >= blockCount) return block;
    const originalMatches = citationMatches(block, providerSources);
    if (originalMatches.length) {
      return { ...block, citationUrls: originalMatches.map((source) => source.url).slice(0, 4) };
    }
    const repaired = repair.blocks[index];
    if (!isProviderRecord(repaired) || !Array.isArray(repaired.sourceIds) || typeof repaired.unsupported !== "boolean") {
      throw citationRepairFailure();
    }
    if (repaired.unsupported) {
      unsupportedIndexes.push(index);
      return block;
    }
    const citationUrls = [...new Set(repaired.sourceIds)]
      .map((sourceId) => /^S([1-9]|1[0-6])$/.test(sourceId) ? providerSources[Number(sourceId.slice(1)) - 1]?.url : undefined)
      .filter((url): url is string => Boolean(url))
      .slice(0, 4);
    if (!citationUrls.length) {
      unsupportedIndexes.push(index);
      return block;
    }
    return { ...block, citationUrls };
  });
  return { turn: { ...modelTurn, answerBlocks }, unsupportedIndexes };
}

export function applyCitationRecovery(
  modelTurn: ModelTurn,
  providerSources: ProviderSource[],
  unsupportedIndexes: number[],
  recovery: CitationRecovery,
): ModelTurn {
  if (!Array.isArray(recovery.blocks) || recovery.blocks.length !== unsupportedIndexes.length) {
    throw citationRepairFailure();
  }
  const recoveredByIndex = new Map<number, ModelTurn["answerBlocks"][number]>();
  for (const recovered of recovery.blocks) {
    if (!isProviderRecord(recovered) || typeof recovered.block !== "number" || !Number.isInteger(recovered.block)) {
      throw citationRepairFailure();
    }
    const recoveredIndex = recovered.block - 1;
    if (!unsupportedIndexes.includes(recoveredIndex)) throw citationRepairFailure();
    const matches = citationMatches(recovered, providerSources);
    if (!matches.length || recoveredByIndex.has(recoveredIndex)) throw citationRepairFailure();
    recoveredByIndex.set(recoveredIndex, {
      text: boundedString(recovered.text, 80, 900, `recovered answer block ${recovered.block}`),
      citationUrls: matches.map((source) => source.url).slice(0, 4),
    });
  }
  if (recoveredByIndex.size !== unsupportedIndexes.length) throw citationRepairFailure();
  return {
    ...modelTurn,
    answerBlocks: modelTurn.answerBlocks.map((block, index) => recoveredByIndex.get(index) ?? block),
  };
}

export function pruneUnsupportedBlocks(modelTurn: ModelTurn, unsupportedIndexes: number[]): ModelTurn {
  const unsupported = new Set(unsupportedIndexes);
  const answerBlocks = modelTurn.answerBlocks.filter((_, index) => !unsupported.has(index));
  if (answerBlocks.length < 2) throw citationRepairFailure();
  return { ...modelTurn, answerBlocks };
}

export function invalidCitationIndexes(modelTurn: ModelTurn, providerSources: ProviderSource[]): number[] {
  if (!Array.isArray(modelTurn.answerBlocks)) return [];
  return modelTurn.answerBlocks
    .slice(0, 5)
    .map((block, index) => citationMatches(block, providerSources).length ? -1 : index)
    .filter((index) => index >= 0);
}

function citationMatches(block: unknown, providerSources: ProviderSource[]): ProviderSource[] {
  if (!isProviderRecord(block) || !Array.isArray(block.citationUrls)) return [];
  return dedupeSources(
    block.citationUrls
      .map((url) => matchSource(stringValue(url), providerSources))
      .filter((source): source is ProviderSource => Boolean(source)),
  );
}

export function prioritizeTurnSources(modelTurn: ModelTurn, providerSources: ProviderSource[]): ProviderSource[] {
  const cited = Array.isArray(modelTurn.answerBlocks)
    ? modelTurn.answerBlocks.flatMap((block) => citationMatches(block, providerSources))
    : [];
  return dedupeSources([...cited, ...providerSources]).slice(0, 16);
}

export function validateAndMapTurn(
  modelTurn: ModelTurn,
  providerSources: ProviderSource[],
  imagePreference: ImagePreference = "when-useful",
  providerImages: ProviderImage[] = [],
  outputLocale: SupportedLocale = "en",
  diagnostics: TurnValidationDiagnostics = {},
) {
  const compactScript = false;
  const topicLabel = boundedString(modelTurn.topicLabel, 2, 56, "topic label", diagnostics);
  const transition = boundedString(modelTurn.transition, compactScript ? 8 : 20, 420, "transition", diagnostics);
  const researchSummary = boundedString(modelTurn.researchSummary, compactScript ? 12 : 24, 520, "research summary", diagnostics);
  const researchHandoff = validateHandoff(modelTurn.researchHandoff, providerSources, diagnostics);
  const media = imagePreference === "avoid" ? [] : validateMediaGallery(providerImages, topicLabel, modelTurn.visualNotes, outputLocale);
  if (imagePreference === "prefer" && !media.length) {
    throw new RepositoryError(
      "RESEARCH_VALIDATION_FAILED",
      "CuriosityPedia could not secure sourced real-world visual evidence for this answer. Nothing was saved; image research will retry.",
      502,
      true,
    );
  }
  if (modelTurn.preferredPosition !== 0 && modelTurn.preferredPosition !== 1) {
    throw validationFailure("The preferred path was invalid.", "SCHEMA_INVALID", diagnostics);
  }
  if (!Array.isArray(modelTurn.options) || modelTurn.options.length !== 2) {
    throw validationFailure("The performance did not return exactly two paths.", "SCHEMA_INVALID", diagnostics);
  }
  const options = modelTurn.options.map((option, index) => {
    if (!isProviderRecord(option)) throw validationFailure(`Path ${index + 1} was invalid.`, "SCHEMA_INVALID", diagnostics);
    return {
      question: boundedString(option.question, compactScript ? 3 : 7, 110, `path ${index + 1}`, diagnostics),
      angle: boundedString(option.angle, 2, 32, `path ${index + 1} angle`, diagnostics),
    };
  });
  if (normalizeText(options[0].question) === normalizeText(options[1].question)) {
    throw validationFailure("The two next paths were not distinct.", "SCHEMA_INVALID", diagnostics);
  }
  if (!Array.isArray(modelTurn.answerBlocks) || modelTurn.answerBlocks.length < 2) {
    throw validationFailure("The performance did not return enough answer blocks.", "SCHEMA_INVALID", diagnostics);
  }

  const citedSourceIds = new Set<string>();
  const answerBlocks: AnswerBlock[] = modelTurn.answerBlocks.slice(0, 5).map((block, index) => {
    if (!isProviderRecord(block) || !Array.isArray(block.citationUrls)) {
      throw validationFailure(`Answer block ${index + 1} had invalid citations.`, "CITATION_INVALID", diagnostics);
    }
    const matches = block.citationUrls
      .map((url) => matchSource(stringValue(url), providerSources))
      .filter((source): source is ProviderSource => Boolean(source));
    const uniqueMatches = dedupeSources(matches).slice(0, 4);
    if (!uniqueMatches.length) {
      diagnostics.citationMismatch?.({
        block: index + 1,
        citedUrls: block.citationUrls.map((url) => stringValue(url)).slice(0, 4),
        consultedUrls: providerSources.map((source) => source.url).slice(0, 16),
      });
      throw validationFailure(`Answer block ${index + 1} did not cite a consulted source.`, "CITATION_INVALID", diagnostics);
    }
    const sourceIds = uniqueMatches.map((source) => stableKey(source.url));
    sourceIds.forEach((id) => citedSourceIds.add(id));
    return {
      text: boundedString(block.text, compactScript ? 20 : 48, 900, `answer block ${index + 1}`, diagnostics),
      sourceIds,
    };
  });

  const sources: Source[] = providerSources.slice(0, 16).map((source) => ({
    id: stableKey(source.url),
    title: source.title,
    publisher: source.publisher,
    url: source.url,
    relation: citedSourceIds.has(stableKey(source.url)) ? "cited" : "consulted",
  }));
  for (const image of media) {
    if (sources.some((source) => citationComparableUrl(source.url) === citationComparableUrl(image.sourcePageUrl))) continue;
    const host = new URL(image.sourcePageUrl).hostname.replace(/^www\./, "");
    sources.push({
      id: stableKey(image.sourcePageUrl),
      title: image.caption,
      publisher: host,
      url: image.sourcePageUrl,
      relation: "image",
    });
  }

  return {
    topicLabel,
    answer: answerBlocks.map((block) => block.text).join("\n\n"),
    answerBlocks,
    media,
    transition,
    researchSummary,
    researchHandoff,
    preferredPosition: modelTurn.preferredPosition,
    options,
    sources,
  };
}

function validateHandoff(value: unknown, sources: ProviderSource[], diagnostics: TurnValidationDiagnostics): ResearchHandoff {
  if (!isProviderRecord(value)) throw validationFailure("The research handoff was invalid.", "SCHEMA_INVALID", diagnostics);
  const sourceLeads = stringArray(value.sourceLeads)
    .map((url) => matchSource(url, sources)?.url)
    .filter((url): url is string => Boolean(url));
  return {
    discoveries: boundedArray(value.discoveries, 5),
    uncertainties: boundedArray(value.uncertainties, 4),
    unresolvedThreads: boundedArray(value.unresolvedThreads, 5),
    sourceLeads: [...new Set(sourceLeads)].slice(0, 8),
  };
}

function boundedArray(value: unknown, maxItems: number): string[] {
  return stringArray(value).slice(0, maxItems).map((item) => item.trim().slice(0, 280)).filter(Boolean);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function boundedString(
  value: unknown,
  min: number,
  max: number,
  label: string,
  diagnostics: TurnValidationDiagnostics = {},
): string {
  const normalized = normalizeGeneratedProse(stringValue(value));
  const toleratedMin = Math.max(1, Math.floor(min * 0.8));
  const toleratedMax = Math.ceil(max * 1.2);
  if (normalized.length < toleratedMin || normalized.length > toleratedMax) {
    throw validationFailure(
      `The ${label} length was ${normalized.length}; expected ${min}-${max} with 20% tolerance (${toleratedMin}-${toleratedMax}).`,
      "SCHEMA_INVALID",
      diagnostics,
    );
  }
  return normalized;
}

export function normalizeGeneratedProse(value: string) {
  return value
    .trim()
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/\s+/g, " ");
}

const VISUAL_COMMENTARY_WORD_LIMIT = [30, 110] as const;

function words(value: string, locale: SupportedLocale = "en") {
  const normalized = normalizeGeneratedProse(value);
  if (typeof Intl.Segmenter === "function") {
    return [...new Intl.Segmenter(locale, { granularity: "word" }).segment(normalized)]
      .filter((segment) => segment.isWordLike)
      .map((segment) => segment.segment);
  }
  return normalized.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
}

function withinWordLimit(value: string, [minimum, maximum]: readonly [number, number], locale: SupportedLocale) {
  const count = words(value, locale).length;
  return count >= minimum && count <= maximum;
}

function isSpecificVisualNote(note: ModelVisualNote, _caption: string, locale: SupportedLocale) {
  const limit = usesCompactWordSegmentation(locale) ? [12, 130] as const : VISUAL_COMMENTARY_WORD_LIMIT;
  return withinWordLimit(visualNoteCommentary(note), limit, locale);
}

export function visualNoteCommentary(note: ModelVisualNote | TurnMedia) {
  if (note.commentary?.trim()) return note.commentary;
  return [note.whyIncluded, ...(note.whatToNotice ?? []), note.learning].filter(Boolean).join(" ");
}

function normalizedCuriosityQuestion(value: unknown) {
  const question = normalizeGeneratedProse(stringValue(value)).slice(0, 140).trim();
  if (
    question.length < 8
    || /\b(?:according to|which (?:option|choice)|encyclopedia|knowledge check|panel|answer above)\b/i.test(question)
  ) return undefined;
  return question.endsWith("?") ? question : `${question}?`;
}

function normalizedKnowledgeCheck(value: unknown, canonicalQuestion?: string): TurnMedia["knowledgeCheck"] | undefined {
  if (!isProviderRecord(value) || !Array.isArray(value.options)) return undefined;
  const declarationQuestion = normalizeGeneratedProse(stringValue(value.declarationQuestion)).slice(0, 260);
  const question = standaloneKnowledgeQuestion(
    canonicalQuestion || normalizeGeneratedProse(stringValue(value.question)),
  ).slice(0, 140);
  const options = value.options
    .map((option) => normalizeGeneratedProse(stringValue(option)).slice(0, 260))
    .filter((option) => option.length >= 8);
  const explanation = normalizeGeneratedProse(stringValue(value.explanation)).slice(0, 420);
  const correctOptionIndex = value.correctOptionIndex;
  if (
    question.length < 8
    || /\b(?:according to|do you understand|which (?:option|choice)|best matches|what does (?:this|the) (?:image|panel)|encyclopedia|knowledge check)\b/i.test(question)
    || options.length !== 8
    || new Set(options.map((option) => option.toLocaleLowerCase())).size !== 8
    || typeof correctOptionIndex !== "number"
    || !Number.isInteger(correctOptionIndex)
    || correctOptionIndex < 0
    || correctOptionIndex > 7
    || explanation.length < 12
  ) return undefined;
  return {
    ...(declarationQuestion ? { declarationQuestion } : {}),
    question,
    options,
    correctOptionIndex,
    explanation,
  };
}

export function validateMediaGallery(
  values: ProviderImage[],
  topicLabel: string,
  notes: ModelVisualNote[] = [],
  outputLocale: SupportedLocale = "en",
): TurnMedia[] {
  const seen = new Set<string>();
  const seenSources = new Set<string>();
  const seenQuestions = new Set<string>();
  const gallery: TurnMedia[] = [];
  const notesBySource = new Map(
    notes
      .filter((note) => isProviderRecord(note))
      .map((note) => [citationComparableUrl(stringValue(note.sourcePageUrl)), note] as const)
      .filter((entry): entry is [string, ModelVisualNote] => Boolean(entry[0])),
  );
  for (const value of values) {
    const imageUrl = canonicalUrl(value.imageUrl);
    const sourcePageUrl = canonicalUrl(value.sourcePageUrl);
    const thumbnailUrl = canonicalUrl(value.thumbnailUrl ?? "");
    if (!imageUrl || !sourcePageUrl || !isSafePublicImageUrl(imageUrl) || seen.has(imageUrl) || seenSources.has(sourcePageUrl)) continue;
    if (thumbnailUrl && !isSafePublicImageUrl(thumbnailUrl)) continue;
    const caption = normalizeGeneratedProse(value.caption).slice(0, 384) || `Visual reference for ${topicLabel}`;
    const note = notesBySource.get(citationComparableUrl(sourcePageUrl) ?? "");
    if (!note || !isSpecificVisualNote(note, caption, outputLocale)) continue;
    const title = normalizeGeneratedProse(note.title).slice(0, 116);
    const commentary = normalizeGeneratedProse(visualNoteCommentary(note)).slice(0, 520);
    const curiosityQuestion = normalizedCuriosityQuestion(note.curiosityQuestion);
    const knowledgeCheck = normalizedKnowledgeCheck(note.knowledgeCheck, curiosityQuestion);
    if (Object.prototype.hasOwnProperty.call(note, "knowledgeCheck") && !knowledgeCheck) continue;
    if (knowledgeCheck) {
      const questionKey = knowledgeCheck.question
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();
      if (!questionKey || seenQuestions.has(questionKey)) continue;
      seenQuestions.add(questionKey);
    }
    seen.add(imageUrl);
    seenSources.add(sourcePageUrl);
    gallery.push({
      imageUrl,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      sourcePageUrl,
      caption,
      alt: title.slice(0, 288),
      title,
      role: note.role,
      commentary,
      evidenceRelation: note.evidenceRelation,
      ...(curiosityQuestion ? { curiosityQuestion } : {}),
      ...(knowledgeCheck ? { knowledgeCheck } : {}),
    });
    if (gallery.length === 12) break;
  }
  return gallery;
}

export function imagePreferenceForQuestion(imagePreference: ImagePreference, question: string): ImagePreference {
  if (imagePreference !== "when-useful") return imagePreference;
  return /\b(images?|photos?|photographs?|pictures?|visuals?)\b/i.test(question) ? "prefer" : imagePreference;
}

export function fallbackMediaGallery(values: ProviderImage[], topicLabel: string): TurnMedia[] {
  const seen = new Set<string>();
  const seenSources = new Set<string>();
  const gallery: TurnMedia[] = [];
  for (const value of values) {
    const imageUrl = canonicalUrl(value.imageUrl);
    const sourcePageUrl = canonicalUrl(value.sourcePageUrl);
    const thumbnailUrl = canonicalUrl(value.thumbnailUrl ?? "");
    if (!imageUrl || !sourcePageUrl || !isSafePublicImageUrl(imageUrl) || seen.has(imageUrl) || seenSources.has(sourcePageUrl)) continue;
    if (thumbnailUrl && !isSafePublicImageUrl(thumbnailUrl)) continue;
    const caption = normalizeGeneratedProse(value.caption).slice(0, 384) || `Visual reference for ${topicLabel}`;
    seen.add(imageUrl);
    seenSources.add(sourcePageUrl);
    gallery.push({
      imageUrl,
      ...(thumbnailUrl ? { thumbnailUrl } : {}),
      sourcePageUrl,
      caption,
      alt: caption.slice(0, 288),
      title: caption.slice(0, 116),
      role: "context",
    });
    if (gallery.length === 12) break;
  }
  return gallery;
}

function isSafePublicImageUrl(value: string) {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (host === "localhost" || host.endsWith(".localhost") || host === "0.0.0.0" || host === "::1") return false;
  if (/^(10|127|169\.254|192\.168)\./.test(host)) return false;
  const private172 = host.match(/^172\.(\d+)\./);
  return !private172 || Number(private172[1]) < 16 || Number(private172[1]) > 31;
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function validationFailure(
  detail: string,
  code: "SCHEMA_INVALID" | "CITATION_INVALID" = "SCHEMA_INVALID",
  diagnostics: TurnValidationDiagnostics = {},
) {
  diagnostics.validationFailure?.(detail);
  return new RepositoryError(
    code,
    code === "CITATION_INVALID"
      ? "The live answer cited evidence that was not in its consulted sources. Nothing was saved; please retry."
      : "The live answer could not be formatted safely after applying CuriosityPedia’s 20% tolerance. Nothing was saved; please retry.",
    502,
    true,
  );
}

export function imageNoteRepairFailure() {
  return new RepositoryError(
    "SCHEMA_INVALID",
    "The optional factual-image notes could not be associated safely; the text answer can continue without them.",
    502,
    false,
  );
}

function citationRepairFailure() {
  return new RepositoryError(
    "CITATION_INVALID",
    "The live answer could not retain enough verified citations after automatic recovery. Nothing was saved; please retry.",
    502,
    true,
  );
}
