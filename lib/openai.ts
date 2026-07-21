import { env } from "cloudflare:workers";
import { RepositoryError } from "./errors";
export { OPENAI_PROMPT_LIMITS } from "./research-config";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Cloudflare augments this namespace.
  namespace Cloudflare {
    interface Env {
      OPENAI_API_KEY?: string;
      CURIOSITYPEDIA_OPENAI_ENABLED?: string;
    }
  }
}

const RESPONSES_URL = "https://api.openai.com/v1/responses";

export function openAIConfigured(): boolean {
  return openAIEnabled() && Boolean(env.OPENAI_API_KEY?.trim());
}

export function openAIEnabled(): boolean {
  const configured = env.CURIOSITYPEDIA_OPENAI_ENABLED?.trim().toLowerCase();
  return configured !== "0" && configured !== "false" && configured !== "off" && configured !== "disabled";
}

export function assertOpenAIAvailable(unavailableMessage?: string) {
  if (!openAIEnabled()) {
    throw new RepositoryError(
      "PROVIDER_UNAVAILABLE",
      "OpenAI-backed generation is temporarily disabled on this deployment.",
      503,
      true,
    );
  }
  if (!env.OPENAI_API_KEY?.trim()) {
    throw new RepositoryError(
      "PROVIDER_UNAVAILABLE",
      unavailableMessage ?? "OpenAI is not configured on this deployment.",
      503,
      true,
    );
  }
}

/** The single server-only transport for every OpenAI Responses request. */
export function requestOpenAI(
  body: object,
  options: { signal?: AbortSignal; unavailableMessage?: string; idempotencyKey?: string } = {},
): Promise<Response> {
  assertOpenAIAvailable(options.unavailableMessage);
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI availability changed during request preparation.");
  return fetch(RESPONSES_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      ...(options.idempotencyKey ? { "idempotency-key": options.idempotencyKey } : {}),
    },
    body: JSON.stringify(body),
    signal: options.signal,
  });
}

/** Retrieves a stored Responses API result by its server-side identifier. */
export function retrieveOpenAIResponse(
  responseId: string,
  options: {
    signal?: AbortSignal;
    unavailableMessage?: string;
    include?: readonly string[];
  } = {},
): Promise<Response> {
  assertOpenAIAvailable(options.unavailableMessage);
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI availability changed during response retrieval.");
  if (!/^resp_[A-Za-z0-9_-]+$/.test(responseId)) {
    throw new RepositoryError("BAD_REQUEST", "The stored provider response identifier is invalid.", 400);
  }
  const url = new URL(`${RESPONSES_URL}/${encodeURIComponent(responseId)}`);
  for (const include of options.include ?? []) {
    url.searchParams.append("include[]", include);
  }
  return fetch(url, {
    headers: { authorization: `Bearer ${apiKey}` },
    signal: options.signal,
  });
}

/** Cancels a stored background Responses API request. The operation is idempotent upstream. */
export function cancelOpenAIResponse(
  responseId: string,
  options: { signal?: AbortSignal; unavailableMessage?: string } = {},
): Promise<Response> {
  assertOpenAIAvailable(options.unavailableMessage);
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OpenAI availability changed during response cancellation.");
  if (!/^resp_[A-Za-z0-9_-]+$/.test(responseId)) {
    throw new RepositoryError("BAD_REQUEST", "The stored provider response identifier is invalid.", 400);
  }
  return fetch(`${RESPONSES_URL}/${encodeURIComponent(responseId)}/cancel`, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}` },
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
