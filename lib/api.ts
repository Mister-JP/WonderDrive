import { NextResponse } from "next/server";
import type { ApiFailure, ApiSuccess } from "./contracts";
import { RepositoryError } from "./repository";
import { publicViewer, type ViewerContext } from "./viewer";

export function success<T>(data: T, viewer: ViewerContext, status = 200) {
  const response = NextResponse.json<ApiSuccess<T>>(
    { data, viewer: publicViewer(viewer) },
    { status },
  );
  if (viewer.setCookie) response.headers.append("set-cookie", viewer.setCookie);
  response.headers.set("cache-control", "no-store");
  return response;
}

export function failure(error: unknown) {
  if (error instanceof RepositoryError) {
    return NextResponse.json<ApiFailure>(
      {
        error: {
          code: error.code,
          message: error.message,
          retryable: error.retryable,
        },
      },
      { status: error.status },
    );
  }
  console.error("WonderDrive API error", error);
  return NextResponse.json<ApiFailure>(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "WonderDrive could not complete that request.",
        retryable: true,
      },
    },
    { status: 500 },
  );
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new RepositoryError("BAD_REQUEST", "The request body must be valid JSON.", 400);
  }
}
