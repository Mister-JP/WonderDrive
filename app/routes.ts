export type CuriosityPediaRoute =
  | { name: "start" }
  | { name: "journeys" }
  | { name: "bookmarks" }
  | { name: "usage" }
  | { name: "settings" }
  | { name: "about" }
  | {
      name: "journey";
      journeyId: string;
      turnId?: string;
      surface: "stage" | "map";
    };

const STATIC_ROUTES = new Map<string, CuriosityPediaRoute>([
  ["/", { name: "start" }],
  ["/journeys", { name: "journeys" }],
  ["/library", { name: "journeys" }],
  ["/bookmarks", { name: "bookmarks" }],
  ["/usage", { name: "usage" }],
  ["/settings", { name: "settings" }],
  ["/about", { name: "about" }],
]);

export function parseCuriosityPediaRoute(
  pathname: string,
  search: string | URLSearchParams = "",
): CuriosityPediaRoute | null {
  const normalizedPath = normalizePath(pathname);
  const staticRoute = STATIC_ROUTES.get(normalizedPath);
  if (staticRoute) return staticRoute;

  const query = typeof search === "string"
    ? new URLSearchParams(search.startsWith("?") ? search.slice(1) : search)
    : search;

  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments[0] !== "journeys" || !segments[1]) return null;

  const journeyId = decodeSegment(segments[1]);
  if (!journeyId) return null;

  if (segments.length === 2) {
    return { name: "journey", journeyId, surface: "stage" };
  }
  if (segments.length === 3 && segments[2] === "map") {
    return {
      name: "journey",
      journeyId,
      turnId: cleanId(query.get("turn")),
      surface: "map",
    };
  }
  if (segments.length === 4 && segments[2] === "turns") {
    const turnId = decodeSegment(segments[3]);
    return turnId
      ? { name: "journey", journeyId, turnId, surface: "stage" }
      : null;
  }
  return null;
}

export function staticRoutePath(name: "start" | "journeys" | "bookmarks" | "usage" | "settings" | "about") {
  return name === "start" ? "/" : `/${name}`;
}

export function journeyStagePath(journeyId: string, turnId?: string) {
  const base = `/journeys/${encodeURIComponent(journeyId)}`;
  return turnId ? `${base}/turns/${encodeURIComponent(turnId)}` : base;
}

export function journeyMapPath(journeyId: string, turnId?: string) {
  const base = `/journeys/${encodeURIComponent(journeyId)}/map`;
  return turnId ? `${base}?turn=${encodeURIComponent(turnId)}` : base;
}

function normalizePath(pathname: string) {
  if (!pathname || pathname === "/") return "/";
  return `/${pathname.split("/").filter(Boolean).join("/")}`;
}

function decodeSegment(value: string) {
  try {
    return cleanId(decodeURIComponent(value));
  } catch {
    return undefined;
  }
}

function cleanId(value: string | null | undefined) {
  const cleaned = value?.trim();
  return cleaned || undefined;
}
