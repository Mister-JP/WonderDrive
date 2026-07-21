import type { ModelId, Viewer } from "../contracts";
import { RepositoryError } from "../errors";
import { isRecord, requestOpenAI } from "../openai";
import { releaseProviderCost, reserveProviderCost } from "../provider-cost-control";
import { recordOpenAIUsage } from "../provider-usage";
import type { OpenAIResponse } from "./provider-response";

type ProviderStreamUsageContext = {
  identityId: string;
  viewerMode: Viewer["mode"];
  journeyId?: string;
  turnId?: string;
  researchRequestId: string;
  modelId: ModelId;
  operation: "live_research";
  purpose: string;
  metadata: Record<string, string | number | boolean | null>;
  callKey: string;
};

type ProviderStreamProgress =
  | { kind: "search" }
  | { kind: "output_delta"; delta: string };

export type ProviderStreamResult = {
  completedResponse: OpenAIResponse;
  outputText: string;
};

type RunProviderStreamInput = {
  requestBody: object;
  timeoutMs: number;
  startedAt: number;
  usageContext: ProviderStreamUsageContext;
  externalSignal?: AbortSignal;
  onProgress?: (progress: ProviderStreamProgress) => void;
};

export async function runProviderStream({
  requestBody,
  timeoutMs,
  startedAt,
  usageContext,
  externalSignal,
  onProgress = () => {},
}: RunProviderStreamInput): Promise<ProviderStreamResult> {
  let outputText = "";
  let completedResponse: OpenAIResponse | null = null;
  let usageRecorded = false;
  let providerRequestId: string | null = null;
  let providerEventCount = 0;
  let malformedEventCount = 0;
  let outputDeltaCount = 0;
  let lastProviderEventType = "none";
  let sawProviderDone = false;
  if (externalSignal?.aborted) throw clientAbortError();
  const reservation = await reserveProviderCost({
    callKey: usageContext.callKey,
    identityId: usageContext.identityId,
    viewerMode: usageContext.viewerMode,
    modelId: usageContext.modelId,
    operation: usageContext.operation,
    requestBody,
    researchRequestId: usageContext.researchRequestId,
    journeyId: usageContext.journeyId,
    turnId: usageContext.turnId,
  });
  if (externalSignal?.aborted) {
    await releaseProviderCost(reservation.id);
    throw clientAbortError();
  }

  const observeProviderFrame = (kind: "event" | "done" | "malformed", type = "") => {
    if (kind === "event") {
      providerEventCount += 1;
      lastProviderEventType = type || "unknown";
    } else if (kind === "done") {
      sawProviderDone = true;
    } else {
      malformedEventCount += 1;
    }
  };
  const streamDiagnostics = (stage: string) => ({
    stage,
    providerEventCount,
    malformedEventCount,
    outputDeltaCount,
    lastProviderEventType,
    sawProviderDone,
  });
  const recordOutcome = (input: Parameters<typeof recordOpenAIUsage>[0]) =>
    recordOpenAIUsage({
      ...usageContext,
      costReservationId: reservation.id,
      ...input,
      metadata: {
        ...usageContext.metadata,
        ...input.metadata,
      },
    });

  const controller = new AbortController();
  const abortFromClient = () => controller.abort("CuriosityPedia client disconnected");
  externalSignal?.addEventListener("abort", abortFromClient, { once: true });
  if (externalSignal?.aborted) abortFromClient();
  const timeout = setTimeout(() => controller.abort("CuriosityPedia research timeout"), timeoutMs);
  let response: Response;
  try {
    response = await requestOpenAI(requestBody, {
      signal: controller.signal,
      unavailableMessage: "Live research is not configured on this deployment.",
    });
    providerRequestId = response.headers.get("x-request-id");

    if (!response.ok) {
      const retryable = response.status === 408
        || response.status === 409
        || response.status === 429
        || response.status >= 500;
      usageRecorded = true;
      await recordOutcome({
        ...usageContext,
        outcome: "http_error",
        providerRequestId,
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: `HTTP_${response.status}`,
        errorMessage: "Live research provider request was rejected.",
        metadata: streamDiagnostics("request_rejected"),
      });
      console.error("OpenAI Responses request failed", {
        status: response.status,
        requestId: providerRequestId,
      });
      throw new RepositoryError(
        response.status === 401 || response.status === 403
          ? "PROVIDER_UNAVAILABLE"
          : "PROVIDER_ERROR",
        response.status === 401 || response.status === 403
          ? "This deployment cannot access the selected OpenAI model. Choose another model or verify the production OpenAI project access."
          : response.status === 429
            ? "Live research is busy or has reached its provider limit. Please try again shortly."
            : retryable
              ? "Live research could not reach the provider. The journey was not committed; it is safe to retry."
              : "The provider rejected this research request. Verify the selected model and shared generation configuration.",
        response.status === 429 ? 429 : 502,
        retryable,
      );
    }

    if (!response.body) {
      usageRecorded = true;
      await recordOutcome({
        ...usageContext,
        outcome: "provider_failed",
        providerRequestId,
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: "MISSING_RESPONSE_BODY",
        errorMessage: "The live research response did not contain a stream.",
        metadata: streamDiagnostics("missing_response_body"),
      });
      throw new RepositoryError(
        "PROVIDER_ERROR",
        "The live research stream ended before it began. The journey was not committed.",
        502,
        true,
      );
    }

    for await (const event of readServerSentEvents(response.body, observeProviderFrame)) {
      if (!event || typeof event !== "object") continue;
      const type = typeof event.type === "string" ? event.type : "";
      if (type.includes("web_search_call")) onProgress({ kind: "search" });
      if (type === "response.output_text.delta" && typeof event.delta === "string") {
        outputDeltaCount += 1;
        outputText += event.delta;
        onProgress({ kind: "output_delta", delta: event.delta });
      }
      if (type === "response.completed" && isRecord(event.response)) {
        completedResponse = event.response as OpenAIResponse;
      }
      if (type === "response.incomplete" && isRecord(event.response)) {
        usageRecorded = true;
        const reason = isRecord(event.response.incomplete_details)
          ? stringValue(event.response.incomplete_details.reason)
          : "unknown";
        await recordOutcome({
          ...usageContext,
          outcome: "incomplete",
          response: event.response,
          providerRequestId,
          httpStatus: response.status,
          latencyMs: Date.now() - startedAt,
          errorCode: reason || "INCOMPLETE",
          errorMessage: `Live research ended incomplete (${reason || "unknown reason"}).`,
          metadata: streamDiagnostics("stream_incomplete"),
        });
        throw new RepositoryError(
          "PROVIDER_ERROR",
          reason === "max_output_tokens"
            ? "Live research used its full reasoning and output allowance before the answer was complete. Nothing was saved; please retry."
            : "The provider ended live research before the answer was complete. Nothing was saved; please retry.",
          502,
          true,
        );
      }
      if (type === "error" || type === "response.failed") {
        usageRecorded = true;
        const failedResponse = isRecord(event.response) ? event.response : undefined;
        await recordOutcome({
          ...usageContext,
          outcome: "provider_failed",
          response: failedResponse,
          providerRequestId,
          httpStatus: response.status,
          latencyMs: Date.now() - startedAt,
          errorCode: type,
          errorMessage: "The provider interrupted live research.",
          metadata: streamDiagnostics("stream_failed"),
        });
        throw new RepositoryError(
          "PROVIDER_ERROR",
          "The provider interrupted live research. No partial journey was saved.",
          502,
          true,
        );
      }
    }
  } catch (error) {
    if (error instanceof RepositoryError) throw error;
    if (!usageRecorded) {
      usageRecorded = true;
      await recordOutcome({
        ...usageContext,
        outcome: "transport_error",
        response: completedResponse ?? undefined,
        providerRequestId,
        latencyMs: Date.now() - startedAt,
        errorCode: controller.signal.aborted ? "ABORTED" : error instanceof Error ? error.name : "UNKNOWN_ERROR",
        errorMessage: controller.signal.aborted
          ? String(controller.signal.reason ?? "Live research was aborted.")
          : error instanceof Error ? error.message : "Live research transport was interrupted.",
        metadata: streamDiagnostics("transport_error"),
      });
    }
    if (controller.signal.aborted) {
      throw new RepositoryError(
        "PROVIDER_TIMEOUT",
        "Live research reached its foreground time limit. No partial journey was saved.",
        504,
        true,
      );
    }
    console.error("OpenAI Responses stream failed", error);
    throw new RepositoryError(
      "PROVIDER_ERROR",
      "Live research was interrupted. No partial journey was saved; it is safe to retry.",
      502,
      true,
    );
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abortFromClient);
  }

  if (completedResponse) {
    usageRecorded = true;
    await recordOutcome({
      ...usageContext,
      outcome: "completed",
      response: completedResponse,
      providerRequestId,
      httpStatus: response.status,
      latencyMs: Date.now() - startedAt,
      metadata: streamDiagnostics("stream_completed"),
    });
  }
  if (!completedResponse) {
    if (!usageRecorded) {
      await recordOutcome({
        ...usageContext,
        outcome: "provider_failed",
        providerRequestId,
        httpStatus: response.status,
        latencyMs: Date.now() - startedAt,
        errorCode: "MISSING_TERMINAL_EVENT",
        errorMessage: "The provider stream ended without a terminal response event.",
        metadata: streamDiagnostics("missing_terminal_event"),
      });
    }
    throw new RepositoryError(
      "PROVIDER_ERROR",
      "Live research finished without a complete provider response. Nothing was saved.",
      502,
      true,
    );
  }

  return { completedResponse, outputText };
}

function clientAbortError() {
  return new RepositoryError(
    "PROVIDER_TIMEOUT",
    "Live research reached its foreground time limit. No partial journey was saved.",
    504,
    true,
  );
}

export async function* readServerSentEvents(
  stream: ReadableStream<Uint8Array>,
  observe: (kind: "event" | "done" | "malformed", type?: string) => void = () => {},
) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseServerSentEvent(frame, observe);
        if (event) yield event;
      }
      if (done) {
        const finalEvent = parseServerSentEvent(buffer, observe);
        if (finalEvent) yield finalEvent;
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseServerSentEvent(
  frame: string,
  observe: (kind: "event" | "done" | "malformed", type?: string) => void,
): Record<string, unknown> | null {
  const data = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
  if (!data) return null;
  if (data === "[DONE]") {
    observe("done");
    return null;
  }
  try {
    const event = JSON.parse(data) as Record<string, unknown>;
    observe("event", typeof event.type === "string" ? event.type : "unknown");
    return event;
  } catch {
    observe("malformed");
    return null;
  }
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}
