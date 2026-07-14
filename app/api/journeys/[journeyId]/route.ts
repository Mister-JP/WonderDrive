import { assertMutationOrigin, failure, readJson, success } from "../../../../lib/api";
import { updateJourneyManagement } from "../../../../lib/product-repository";
import { deleteJourney, getJourney } from "../../../../lib/repository";
import { resolveViewer } from "../../../../lib/viewer";

type Context = { params: Promise<{ journeyId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const viewer = await resolveViewer();
    const { journeyId } = await context.params;
    return success(await getJourney(viewer, journeyId), viewer);
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertMutationOrigin(request);
    const viewer = await resolveViewer();
    const { journeyId } = await context.params;
    return success(await updateJourneyManagement(viewer, journeyId, await readJson(request)), viewer);
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertMutationOrigin(request);
    const viewer = await resolveViewer();
    const { journeyId } = await context.params;
    return success(await deleteJourney(viewer, journeyId), viewer);
  } catch (error) {
    return failure(error);
  }
}
