import { failure, readJson, success } from "../../../../../lib/api";
import type { AdvanceJourneyRequest } from "../../../../../lib/contracts";
import { advanceJourney } from "../../../../../lib/repository";
import { resolveViewer } from "../../../../../lib/viewer";

type Context = { params: Promise<{ journeyId: string }> };

export async function POST(request: Request, context: Context) {
  try {
    const viewer = await resolveViewer();
    const { journeyId } = await context.params;
    const body = (await readJson(request)) as AdvanceJourneyRequest;
    return success(await advanceJourney(viewer, journeyId, body), viewer);
  } catch (error) {
    return failure(error);
  }
}
