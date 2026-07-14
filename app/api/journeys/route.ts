import { mutation, query, readJson } from "../../../lib/api";
import type { CreateJourneyRequest } from "../../../lib/contracts";
import { createJourney, listJourneys } from "../../../lib/repository";

export async function GET() {
  return query(listJourneys);
}

export async function POST(request: Request) {
  return mutation(
    request,
    async (viewer) => createJourney(viewer, await readJson<CreateJourneyRequest>(request)),
    201,
  );
}
