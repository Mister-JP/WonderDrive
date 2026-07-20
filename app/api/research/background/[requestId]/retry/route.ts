import { mutation } from "../../../../../../lib/api";
import { retryBackgroundResearch } from "../../../../../../lib/background-research";

export const dynamic = "force-dynamic";

export function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  return mutation(request, async (viewer) => {
    const { requestId } = await context.params;
    return retryBackgroundResearch(viewer, requestId);
  }, 202);
}
