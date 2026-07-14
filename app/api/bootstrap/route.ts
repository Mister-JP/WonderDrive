import { BOOTSTRAP_CATALOG } from "../../../lib/catalog";
import { failure, success } from "../../../lib/api";
import { getPreferences } from "../../../lib/product-repository";
import { resolveViewer } from "../../../lib/viewer";

export async function GET() {
  try {
    const viewer = await resolveViewer();
    const preferences = await getPreferences(viewer);
    return success({ catalog: BOOTSTRAP_CATALOG, preferences }, viewer);
  } catch (error) {
    return failure(error);
  }
}
