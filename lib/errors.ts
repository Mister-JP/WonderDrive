import type { ApiFailure } from "./contracts";

type ErrorCode = ApiFailure["error"]["code"];

/** Expected failures that are safe to translate into the public API contract. */
export class RepositoryError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "RepositoryError";
  }
}

export function publicError(
  error: unknown,
  fallback = "WonderDrive could not complete that request.",
): ApiFailure["error"] {
  if (error instanceof RepositoryError) {
    return { code: error.code, message: error.message, retryable: error.retryable };
  }
  console.error("Unexpected WonderDrive error", error);
  return { code: "INTERNAL_ERROR", message: fallback, retryable: true };
}
