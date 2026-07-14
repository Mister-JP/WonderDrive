import { assertMutationOrigin, failure, readJson, success } from "../../../../../lib/api";
import { createSnapshot, listSnapshots } from "../../../../../lib/product-repository";
import { resolveViewer } from "../../../../../lib/viewer";

type Context = { params: Promise<{ journeyId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const viewer = await resolveViewer();
    const { journeyId } = await context.params;
    return success(await listSnapshots(viewer, journeyId), viewer);
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    assertMutationOrigin(request);
    const viewer = await resolveViewer();
    const { journeyId } = await context.params;
    const body = (await readJson(request)) as { label?: unknown };
    return success(await createSnapshot(viewer, journeyId, body.label), viewer, 201);
  } catch (error) {
    return failure(error);
  }
}
