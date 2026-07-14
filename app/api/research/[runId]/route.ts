import { failure, success } from "../../../../lib/api";
import { getResearchStatus } from "../../../../lib/product-repository";
import { resolveViewer } from "../../../../lib/viewer";

type Context = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const viewer = await resolveViewer();
    const { runId } = await context.params;
    return success(await getResearchStatus(viewer, runId), viewer);
  } catch (error) {
    return failure(error);
  }
}
