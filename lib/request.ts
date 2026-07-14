import { RepositoryError } from "./errors";

/** Shared boundary validation keeps fixture and live requests behaviorally aligned. */
export function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RepositoryError("BAD_REQUEST", "A valid request body is required.", 400);
  }
  return value as Record<string, unknown>;
}

export function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length < 8 || value.length > 100) {
    throw new RepositoryError("BAD_REQUEST", `A valid ${label} ID is required.`, 400);
  }
}

export function assertIdempotencyKey(value: unknown): asserts value is string {
  if (typeof value !== "string" || value.length < 8 || value.length > 100) {
    throw new RepositoryError("BAD_REQUEST", "A valid request key is required.", 400);
  }
}

export function normalizeSeed(value: unknown): string {
  if (typeof value !== "string") throw new RepositoryError("BAD_REQUEST", "Start with a question.", 400);
  const seed = value.trim().replace(/\s+/g, " ");
  if (seed.length < 3 || seed.length > 280) {
    throw new RepositoryError("BAD_REQUEST", "Keep the starting question between 3 and 280 characters.", 400);
  }
  return seed;
}

export function titleFromSeed(seed: string): string {
  return seed.length <= 62 ? seed : `${seed.slice(0, 59).trimEnd()}…`;
}

export async function hashPayload(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
