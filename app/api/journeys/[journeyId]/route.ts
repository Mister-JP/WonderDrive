import { mutation, query, readJson } from "../../../../lib/api";
import { updateJourneyManagement } from "../../../../lib/product-repository";
import { deleteJourney, getJourney } from "../../../../lib/repository";

type Context = { params: Promise<{ journeyId: string }> };

export async function GET(_request: Request, context: Context) {
  return query(async (viewer) => {
    const { journeyId } = await context.params;
    return getJourney(viewer, journeyId);
  });
}

export async function PATCH(request: Request, context: Context) {
  return mutation(request, async (viewer) => {
    const { journeyId } = await context.params;
    return updateJourneyManagement(viewer, journeyId, await readJson(request));
  });
}

export async function DELETE(request: Request, context: Context) {
  return mutation(request, async (viewer) => {
    const { journeyId } = await context.params;
    return deleteJourney(viewer, journeyId);
  });
}
