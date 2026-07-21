"use client";

import type { Dispatch, SetStateAction } from "react";
import type {
  ApiFailure,
  ApiSuccess,
  JourneyDetail,
  LiveResearchRequest,
  LiveResearchStreamEvent,
  PerformerId,
  ResearchEvent,
} from "../lib/contracts";
import { openAIKeyRequestHeaders } from "./byok-client";

export type LiveResearchState = {
  question: string;
  performerId: PerformerId;
  message: string;
  events: ResearchEvent[];
  phase?: "research" | "composition" | "validation";
  status: "running" | "complete" | "error";
  result: JourneyDetail | null;
  error: string | null;
  errorCode: ApiFailure["error"]["code"] | null;
  diagnosticId: string | null;
  retryAttempt: number;
  maxRetries: number;
};

class ApiRequestError extends Error {
  constructor(
    message: string,
    public readonly code: ApiFailure["error"]["code"],
    public readonly retryable: boolean,
    public readonly diagnosticId?: string,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<ApiSuccess<T>> {
  const providerHeaders = url.startsWith("/api/research")
    || /^\/api\/journeys\/[^/]+\/advance(?:[/?]|$)/.test(url)
    ? openAIKeyRequestHeaders()
    : {};
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...providerHeaders,
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || "error" in payload) {
    if ("error" in payload) {
      throw new ApiRequestError(
        payload.error.message,
        payload.error.code,
        payload.error.retryable,
        payload.error.diagnosticId,
      );
    }
    throw new Error("The request failed.");
  }
  return payload;
}

export async function streamLiveResearch(
  request: LiveResearchRequest,
  setState: Dispatch<SetStateAction<LiveResearchState | null>>,
  signal?: AbortSignal,
) {
  const response = await fetch("/api/research", {
    method: "POST",
    headers: { "content-type": "application/json", ...openAIKeyRequestHeaders() },
    body: JSON.stringify(request),
    signal,
  });
  if (!response.ok) {
    const payload = (await response.json()) as ApiFailure;
    throw new ApiRequestError(
      payload.error?.message ?? "Live research could not start.",
      payload.error?.code ?? "INTERNAL_ERROR",
      payload.error?.retryable ?? true,
      payload.error?.diagnosticId,
    );
  }
  if (!response.body) throw new Error("Live research did not return a readable stream.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let complete: Extract<LiveResearchStreamEvent, { type: "complete" }> | null = null;
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        const event = JSON.parse(data) as LiveResearchStreamEvent;
        if (event.type === "started") {
          setState((current) => current && {
            ...current,
            phase: "research",
            question: event.question,
            message: event.message,
            diagnosticId: event.requestId,
            retryAttempt: 0,
            maxRetries: 0,
          });
        } else if (event.type === "retry") {
          setState((current) => current && {
            ...current,
            phase: "research",
            message: event.message,
            events: [],
            retryAttempt: event.attempt,
            maxRetries: event.maxRetries,
          });
        } else if (event.type === "activity") {
          setState((current) => current && {
            ...current,
            phase: event.event.phase ?? current.phase,
            events: current.events.some(({ id }) => id === event.event.id)
              ? current.events
              : [...current.events, event.event],
          });
        } else if (event.type === "error") {
          setState((current) => current && {
            ...current,
            diagnosticId: event.error.diagnosticId ?? current.diagnosticId,
            errorCode: event.error.code,
          });
          throw new ApiRequestError(
            event.error.message,
            event.error.code,
            event.error.retryable,
            event.error.diagnosticId,
          );
        } else if (event.type === "complete") {
          complete = event;
        }
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  if (!complete) throw new Error("Live research ended before a turn was committed.");
  return complete;
}

export function messageFrom(cause: unknown): string {
  return cause instanceof Error ? cause.message : "CuriosityPedia could not complete that request.";
}

export function errorCodeFrom(cause: unknown): ApiFailure["error"]["code"] | null {
  return cause instanceof ApiRequestError ? cause.code : null;
}

export function diagnosticIdFrom(cause: unknown): string | null {
  return cause instanceof ApiRequestError ? cause.diagnosticId ?? null : null;
}
