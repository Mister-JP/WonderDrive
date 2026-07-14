import { NextResponse } from "next/server";
import type { ApiFailure, ApiSuccess } from "./contracts";
import { publicError, RepositoryError } from "./errors";
import { publicViewer, resolveViewer, type ViewerContext } from "./viewer";

function success<T>(data: T, viewer: ViewerContext, status = 200) {
  const response = NextResponse.json<ApiSuccess<T>>(
    { data, viewer: publicViewer(viewer) },
    { status },
  );
  if (viewer.setCookie) response.headers.append("set-cookie", viewer.setCookie);
  response.headers.set("cache-control", "no-store");
  return response;
}

export function failure(error: unknown) {
  return NextResponse.json<ApiFailure>(
    { error: publicError(error) },
    { status: error instanceof RepositoryError ? error.status : 500 },
  );
}

export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new RepositoryError("BAD_REQUEST", "The request body must be valid JSON.", 400);
  }
}

/** Standard authenticated JSON response boundary for read-only routes. */
export async function query<T>(work: (viewer: ViewerContext) => Promise<T>, status = 200) {
  try {
    const viewer = await resolveViewer();
    return success(await work(viewer), viewer, status);
  } catch (error) {
    return failure(error);
  }
}

/** Standard same-origin boundary for every state-changing JSON route. */
export async function mutation<T>(
  request: Request,
  work: (viewer: ViewerContext) => Promise<T>,
  status = 200,
) {
  try {
    assertMutationOrigin(request);
    const viewer = await resolveViewer();
    return success(await work(viewer), viewer, status);
  } catch (error) {
    return failure(error);
  }
}

export function assertMutationOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site") {
    throw new RepositoryError("FORBIDDEN", "Cross-site mutations are not allowed.", 403);
  }
  if (!origin) return;
  const requestUrl = new URL(request.url);
  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new RepositoryError("FORBIDDEN", "The request origin was invalid.", 403);
  }
  if (originUrl.host !== requestUrl.host || originUrl.protocol !== requestUrl.protocol) {
    throw new RepositoryError("FORBIDDEN", "The request origin did not match WonderDrive.", 403);
  }
}
