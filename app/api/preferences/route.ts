import { assertMutationOrigin, failure, readJson, success } from "../../../lib/api";
import { getPreferences, updatePreferences } from "../../../lib/product-repository";
import { resolveViewer } from "../../../lib/viewer";

export async function GET() {
  try {
    const viewer = await resolveViewer();
    return success(await getPreferences(viewer), viewer);
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    assertMutationOrigin(request);
    const viewer = await resolveViewer();
    return success(await updatePreferences(viewer, await readJson(request)), viewer);
  } catch (error) {
    return failure(error);
  }
}
