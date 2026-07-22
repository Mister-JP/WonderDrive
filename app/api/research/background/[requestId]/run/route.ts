import { mutation } from "../../../../../../lib/api";
import { runBackgroundResearch } from "../../../../../../lib/background-research";
import { providerAuthFromRequest } from "../../../../../../lib/provider-auth";

export const dynamic = "force-dynamic";

export function POST(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  return mutation(request, async (viewer) => {
    const { requestId } = await context.params;
    return runBackgroundResearch(
      viewer,
      requestId,
      providerAuthFromRequest(request),
      request.signal,
    );
  });
}
