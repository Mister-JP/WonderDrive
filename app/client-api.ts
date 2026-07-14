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

export type LiveResearchState = {
  question: string;
  performerId: PerformerId;
  message: string;
  events: ResearchEvent[];
  status: "running" | "complete" | "error";
  result: JourneyDetail | null;
  error: string | null;
};

export async function api<T>(url: string, init?: RequestInit): Promise<ApiSuccess<T>> {
  const response = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const payload = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || "error" in payload) {
    throw new Error("error" in payload ? payload.error.message : "The request failed.");
  }
  return payload;
}

export async function streamLiveResearch(
  request: LiveResearchRequest,
  setState: Dispatch<SetStateAction<LiveResearchState | null>>,
) {
  const response = await fetch("/api/research", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) {
    const payload = (await response.json()) as ApiFailure;
    throw new Error(payload.error?.message ?? "Live research could not start.");
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
          setState((current) => current && { ...current, question: event.question, message: event.message });
        } else if (event.type === "activity") {
          setState((current) => current && {
            ...current,
            events: current.events.some(({ id }) => id === event.event.id)
              ? current.events
              : [...current.events, event.event],
          });
        } else if (event.type === "error") {
          throw new Error(event.error.message);
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
  return cause instanceof Error ? cause.message : "WonderDrive could not complete that request.";
}
