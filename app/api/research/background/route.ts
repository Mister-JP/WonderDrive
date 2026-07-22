import { mutation, query, readJson } from "../../../../lib/api";
import { listBackgroundResearch, startBackgroundResearch } from "../../../../lib/background-research";
import type { LiveResearchRequest } from "../../../../lib/contracts";
import { providerAuthFromRequest } from "../../../../lib/provider-auth";

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return query((viewer) => listBackgroundResearch(viewer, {
    reconcile: false,
    providerAuth: providerAuthFromRequest(request),
  }));
}

export function POST(request: Request) {
  return mutation(
    request,
    async (viewer) => startBackgroundResearch(
      viewer,
      await readJson<LiveResearchRequest>(request),
      providerAuthFromRequest(request),
    ),
    202,
  );
}
