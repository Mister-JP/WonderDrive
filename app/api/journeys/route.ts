import { failure, readJson, success } from "../../../lib/api";
import type { CreateJourneyRequest } from "../../../lib/contracts";
import { createJourney, listJourneys } from "../../../lib/repository";
import { resolveViewer } from "../../../lib/viewer";

export async function GET() {
  try {
    const viewer = await resolveViewer();
    return success(await listJourneys(viewer), viewer);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const viewer = await resolveViewer();
    const body = (await readJson(request)) as CreateJourneyRequest;
    return success(await createJourney(viewer, body), viewer, 201);
  } catch (error) {
    return failure(error);
  }
}
