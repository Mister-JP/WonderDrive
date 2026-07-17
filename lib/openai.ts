import { env } from "cloudflare:workers";
import { RepositoryError } from "./errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Cloudflare augments this namespace.
  namespace Cloudflare {
    interface Env {
      OPENAI_API_KEY?: string;
    }
  }
}

const RESPONSES_URL = "https://api.openai.com/v1/responses";

export const OPENAI_PROMPT_LIMITS = {
  liveResearch: {
    spark: { maxToolCalls: 2, maxOutputTokens: 4_000, reasoning: "low", timeoutMs: 25_000 },
    standard: { maxToolCalls: 5, maxOutputTokens: 8_000, reasoning: "medium", timeoutMs: 120_000 },
    deep: { maxToolCalls: 10, maxOutputTokens: 16_000, reasoning: "high", timeoutMs: 120_000 },
  },
  starterGeneration: { maxOutputTokens: 6_000, reasoning: "high" },
  questionRedraw: { maxOutputTokens: 4_000, reasoning: "high" },
  imageNoteRepair: { maxOutputTokens: 3_000, reasoning: "medium", timeoutMs: 30_000 },
  citationRepair: { maxOutputTokens: 2_000, reasoning: "medium", timeoutMs: 30_000 },
  citationRecovery: { maxOutputTokens: 6_000, reasoning: "high", timeoutMs: 60_000 },
} as const;

export function openAIConfigured(): boolean {
  return Boolean(env.OPENAI_API_KEY?.trim());
}

/** The single server-only transport for every OpenAI Responses request. */
export function requestOpenAI(
  body: object,
  options: { signal?: AbortSignal; unavailableMessage?: string } = {},
): Promise<Response> {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new RepositoryError(
      "PROVIDER_UNAVAILABLE",
      options.unavailableMessage ?? "OpenAI is not configured on this deployment.",
      503,
      true,
    );
  }
  return fetch(RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function responseIncompleteReason(value: unknown): string | null {
  if (!isRecord(value) || value.status !== "incomplete" || !isRecord(value.incomplete_details)) {
    return null;
  }
  return typeof value.incomplete_details.reason === "string"
    ? value.incomplete_details.reason
    : "unknown";
}

export function structuredOutput(
  name: string,
  schema: object,
  verbosity: "low" | "medium" | "high" = "low",
) {
  return { verbosity, format: { type: "json_schema", name, strict: true, schema } };
}

/** Extracts text from either a Responses envelope or its raw `output` array. */
export function outputText(value: unknown): string {
  const output = isRecord(value) && "output" in value ? value.output : value;
  if (!Array.isArray(output)) return "";
  const chunks: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (isRecord(content) && content.type === "output_text" && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  return chunks.join("");
}
