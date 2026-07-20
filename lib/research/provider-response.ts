export type ProviderSource = {
  url: string;
  title: string;
  publisher: string;
};

export type ProviderImage = {
  imageUrl: string;
  thumbnailUrl?: string;
  sourcePageUrl: string;
  caption: string;
};

export type OpenAIResponse = {
  id?: unknown;
  output?: unknown;
  usage?: {
    input_tokens?: unknown;
    input_tokens_details?: { cached_tokens?: unknown };
    output_tokens?: unknown;
    total_tokens?: unknown;
    output_tokens_details?: { reasoning_tokens?: unknown };
  };
};

export type ModelVisualNote = {
  sourcePageUrl: string;
  title: string;
  role: "phenomenon" | "mechanism" | "scale" | "anchor" | "comparison"
    | "object" | "process" | "result" | "context" | "primary-source";
  commentary: string;
  whyIncluded?: string;
  whatToNotice?: string[];
  learning?: string;
  evidenceRelation: "shows" | "illustrates" | "contextualizes" | "supports";
  curiosityQuestion?: string;
  knowledgeCheck?: {
    declarationQuestion?: string;
    question: string;
    options: string[];
    correctOptionIndex: number;
    explanation: string;
  };
};

export type ModelTurn = {
  topicLabel: string;
  answerBlocks: Array<{ text: string; citationUrls: string[] }>;
  visualNotes?: ModelVisualNote[];
  transition: string;
  researchSummary: string;
  researchHandoff: {
    discoveries: string[];
    uncertainties: string[];
    unresolvedThreads: string[];
    sourceLeads: string[];
  };
  preferredPosition: 0 | 1;
  options: Array<{ question: string; angle: string }>;
};

export function isProviderRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function parseModelTurn(
  outputText: string,
  validationFailure: (detail: string) => Error,
  reportInvalidJson: (error: unknown) => void = () => {},
): ModelTurn {
  let parsed: unknown;
  try {
    parsed = JSON.parse(outputText);
  } catch (error) {
    reportInvalidJson(error);
    throw validationFailure("The provider response could not be validated as a CuriosityPedia turn.");
  }
  // Strict structured output describes an object-shaped turn. Arrays are
  // objects in JavaScript, but cannot satisfy the turn contract and should fail
  // at this boundary instead of leaking into later field validation.
  if (!isProviderRecord(parsed) || Array.isArray(parsed)) {
    throw validationFailure("The provider response was not a turn object.");
  }
  return parsed as ModelTurn;
}

export function extractSources(response: OpenAIResponse): ProviderSource[] {
  if (!Array.isArray(response.output)) return [];
  const candidates: ProviderSource[] = [];
  for (const item of response.output) {
    if (!isProviderRecord(item)) continue;
    if (item.type === "web_search_call" && isProviderRecord(item.action) && Array.isArray(item.action.sources)) {
      for (const value of item.action.sources) addProviderSource(candidates, value);
    }
    if (Array.isArray(item.content)) {
      for (const content of item.content) {
        if (!isProviderRecord(content) || !Array.isArray(content.annotations)) continue;
        for (const annotation of content.annotations) {
          if (isProviderRecord(annotation) && annotation.type === "url_citation") {
            addProviderSource(candidates, annotation);
          }
        }
      }
    }
  }
  return dedupeSources(candidates).slice(0, 16);
}

export function extractImages(response: OpenAIResponse): ProviderImage[] {
  if (!Array.isArray(response.output)) return [];
  const images: ProviderImage[] = [];
  for (const item of response.output) {
    if (!isProviderRecord(item) || item.type !== "web_search_call") continue;
    const results = Array.isArray(item.results)
      ? item.results
      : isProviderRecord(item.action) && Array.isArray(item.action.results)
        ? item.action.results
        : [];
    for (const result of results) {
      if (!isProviderRecord(result) || result.type !== "image_result") continue;
      const imageUrl = canonicalUrl(stringValue(result.image_url));
      const sourcePageUrl = canonicalUrl(stringValue(result.source_website_url));
      if (!imageUrl || !sourcePageUrl) continue;
      images.push({
        imageUrl,
        sourcePageUrl,
        thumbnailUrl: canonicalUrl(stringValue(result.thumbnail_url)) ?? undefined,
        caption: stringValue(result.caption),
      });
    }
  }
  return images;
}

function addProviderSource(target: ProviderSource[], value: unknown) {
  if (!isProviderRecord(value)) return;
  const canonical = canonicalUrl(stringValue(value.url));
  if (!canonical) return;
  const host = new URL(canonical).hostname.replace(/^www\./, "");
  target.push({
    url: canonical,
    title: stringValue(value.title) || host,
    publisher: host,
  });
}

export function countWebSearchCalls(response: OpenAIResponse): number {
  return Array.isArray(response.output)
    ? response.output.filter((item) => isProviderRecord(item) && item.type === "web_search_call").length
    : 0;
}

export function countPageFetches(response: OpenAIResponse): number {
  if (!Array.isArray(response.output)) return 0;
  return response.output.filter((item) => {
    if (!isProviderRecord(item) || !isProviderRecord(item.action)) return false;
    const actionType = stringValue(item.action.type);
    return actionType === "open_page" || actionType === "find_in_page" || actionType === "open" || actionType === "find";
  }).length;
}

export function matchSource(value: string, sources: ProviderSource[]): ProviderSource | null {
  const canonical = canonicalUrl(value);
  if (!canonical) return null;
  const exact = sources.find((source) => source.url === canonical);
  if (exact) return exact;
  const wanted = citationComparableUrl(canonical);
  return sources.find((source) => citationComparableUrl(source.url) === wanted) ?? null;
}

export function citationComparableUrl(value: string): string | null {
  const canonical = canonicalUrl(value);
  if (!canonical) return null;
  const url = new URL(canonical);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname === "/" ? "/" : url.pathname.replace(/\/+$/, "");
  return `${host}${url.port ? `:${url.port}` : ""}${path}`;
}

export function dedupeSources<T extends ProviderSource>(sources: T[]): T[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

export function canonicalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (key.startsWith("utm_") || key === "gclid" || key === "fbclid") url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return null;
  }
}

export function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}
