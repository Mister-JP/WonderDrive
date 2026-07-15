import { getD1 } from "../db";
import type { DiagnosticIncident, DiagnosticsReport } from "./contracts";
import { RepositoryError } from "./errors";
import type { ViewerContext } from "./viewer";

const RETENTION_DAYS = 30;
const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1_000;

type RequestRow = {
  id: string;
  kind: "create" | "advance";
  request_json: string;
  error_code: string | null;
  error_message: string | null;
  created_at: number;
  completed_at: number | null;
};

type UsageRow = {
  research_request_id: string;
  provider_response_id: string | null;
  provider_request_id: string | null;
  http_status: number | null;
  latency_ms: number;
  metadata_json: string | null;
  created_at: number;
};

type CountRow = { requests: number; failures: number };
type RepeatedRow = { error_code: string; count: number; latest_at: number };

export async function getDiagnostics(
  viewer: ViewerContext,
): Promise<DiagnosticsReport> {
  if (viewer.mode !== "chatgpt") {
    throw new RepositoryError(
      "AUTH_REQUIRED",
      "Sign in with ChatGPT to inspect private diagnostics.",
      401,
    );
  }

  const db = getD1();
  const now = Date.now();
  const [counts, repeated, failed] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS requests,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failures
         FROM research_requests WHERE identity_id = ? AND created_at >= ?`,
      )
      .bind(viewer.identityId, now - 24 * 60 * 60 * 1_000)
      .first<CountRow>(),
    db
      .prepare(
        `SELECT COALESCE(error_code, 'INTERNAL_ERROR') AS error_code,
                COUNT(*) AS count, MAX(completed_at) AS latest_at
         FROM research_requests
         WHERE identity_id = ? AND status = 'failed' AND completed_at >= ?
         GROUP BY COALESCE(error_code, 'INTERNAL_ERROR')
         HAVING COUNT(*) >= 3
         ORDER BY count DESC, latest_at DESC`,
      )
      .bind(viewer.identityId, now - 10 * 60 * 1_000)
      .all<RepeatedRow>(),
    db
      .prepare(
        `SELECT id, kind, request_json, error_code, error_message, created_at, completed_at
         FROM research_requests
         WHERE identity_id = ? AND status = 'failed' AND created_at >= ?
         ORDER BY created_at DESC LIMIT 50`,
      )
      .bind(viewer.identityId, now - RETENTION_MS)
      .all<RequestRow>(),
  ]);

  const requestRows = failed.results ?? [];
  const usageByRequest = new Map<string, UsageRow>();
  if (requestRows.length) {
    const placeholders = requestRows.map(() => "?").join(", ");
    const usage = await db
      .prepare(
        `SELECT research_request_id, provider_response_id, provider_request_id, http_status,
                latency_ms, metadata_json, created_at
         FROM provider_usage_events
         WHERE operation = 'live_research' AND research_request_id IN (${placeholders})
         ORDER BY created_at DESC`,
      )
      .bind(...requestRows.map((row) => row.id))
      .all<UsageRow>();
    for (const row of usage.results ?? []) {
      if (row.research_request_id && !usageByRequest.has(row.research_request_id)) {
        usageByRequest.set(row.research_request_id, row);
      }
    }
  }

  const incidents = requestRows.map((row) => mapIncident(row, usageByRequest.get(row.id)));
  const requests24h = numeric(counts?.requests);
  const failures24h = numeric(counts?.failures);
  return {
    retentionDays: RETENTION_DAYS,
    summary: {
      requests24h,
      failures24h,
      failureRate24h: requests24h ? failures24h / requests24h : 0,
    },
    repeatedFailures: (repeated.results ?? []).map((row) => ({
      errorCode: row.error_code,
      count: numeric(row.count),
      latestAt: numeric(row.latest_at),
    })),
    incidents,
  };
}

function mapIncident(row: RequestRow, usage?: UsageRow): DiagnosticIncident {
  const request = parseRecord(row.request_json);
  const metadata = parseRecord(usage?.metadata_json ?? "");
  return {
    diagnosticId: row.id,
    kind: row.kind,
    status: "failed",
    modelId: stringValue(request.modelId) || "unknown",
    researchPreset: stringValue(request.researchPreset) || "unknown",
    errorCode: row.error_code || "INTERNAL_ERROR",
    errorMessage: row.error_message || "Unexpected live research failure",
    providerRequestId: usage?.provider_request_id ?? null,
    providerResponseId: usage?.provider_response_id ?? null,
    httpStatus: usage?.http_status ?? null,
    stage: stringValue(metadata.stage) || "unrecorded",
    lastProviderEventType: stringValue(metadata.lastProviderEventType) || "unrecorded",
    providerEventCount: numeric(metadata.providerEventCount),
    malformedEventCount: numeric(metadata.malformedEventCount),
    outputDeltaCount: numeric(metadata.outputDeltaCount),
    sawProviderDone: metadata.sawProviderDone === true,
    latencyMs: numeric(usage?.latency_ms),
    createdAt: numeric(row.created_at),
    completedAt: row.completed_at === null ? null : numeric(row.completed_at),
  };
}

function parseRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function numeric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export const diagnosticsTestHooks = { mapIncident };
