import { mutation, readJson } from "../../../../../lib/api";
import type { AdvanceJourneyRequest } from "../../../../../lib/contracts";
import { runLiveRedraw } from "../../../../../lib/live-redraw";
import {
  advanceJourney,
  listRejectedQuestions,
} from "../../../../../lib/repository";
import { providerAuthFromRequest } from "../../../../../lib/provider-auth";

type Context = { params: Promise<{ journeyId: string }> };

export async function POST(request: Request, context: Context) {
  return mutation(request, async (viewer) => {
    const providerAuth = providerAuthFromRequest(request);
    const { journeyId } = await context.params;
    const body = await readJson<AdvanceJourneyRequest>(request);
    return advanceJourney(viewer, journeyId, body, async ({ journey, turn }) =>
      runLiveRedraw({
        identityId: viewer.identityId,
        viewerMode: viewer.mode,
        callKey: body.idempotencyKey,
        journeyId,
        turn,
        performerId: journey.performerId,
        modelId: body.modelId ?? journey.modelId,
        rejectedQuestions: [
          ...await listRejectedQuestions(viewer, journeyId),
          ...turn.options.map((option) => option.question),
        ],
        adventure: body.adventure ?? 50,
        reason: body.reason?.trim() || undefined,
        providerAuth,
      }),
    );
  });
}
