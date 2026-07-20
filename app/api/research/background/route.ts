import { waitUntil } from "cloudflare:workers";
import { mutation, query, readJson } from "../../../../lib/api";
import { listBackgroundResearch, startBackgroundResearch } from "../../../../lib/background-research";
import type { LiveResearchRequest } from "../../../../lib/contracts";

export const dynamic = "force-dynamic";

export function GET() {
  return query((viewer) => listBackgroundResearch(viewer, { defer: waitUntil }));
}

export function POST(request: Request) {
  return mutation(
    request,
    async (viewer) => startBackgroundResearch(viewer, await readJson<LiveResearchRequest>(request)),
    202,
  );
}
