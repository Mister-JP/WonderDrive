import { mutation, readJson } from "../../../../../lib/api";
import type { AdvanceJourneyRequest } from "../../../../../lib/contracts";
import { runLiveRedraw } from "../../../../../lib/live-redraw";
import {
  advanceJourney,
  listRejectedQuestions,
} from "../../../../../lib/repository";

type Context = { params: Promise<{ journeyId: string }> };

export async function POST(request: Request, context: Context) {
  return mutation(request, async (viewer) => {
    const { journeyId } = await context.params;
    const body = await readJson<AdvanceJourneyRequest>(request);
    return advanceJourney(viewer, journeyId, body, async ({ journey, turn }) =>
      runLiveRedraw({
        turn,
        performerId: journey.performerId,
        modelId: journey.modelId,
        rejectedQuestions: [
          ...await listRejectedQuestions(viewer, journeyId),
          ...turn.options.map((option) => option.question),
        ],
        adventure: body.adventure ?? 50,
        reason: body.reason?.trim() || undefined,
      }),
    );
  });
}
