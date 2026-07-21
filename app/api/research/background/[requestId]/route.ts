import { waitUntil } from "cloudflare:workers";
import { mutation } from "../../../../../lib/api";
import { cancelBackgroundResearch, dismissFailedBackgroundResearch } from "../../../../../lib/background-research";
import { providerAuthFromRequest } from "../../../../../lib/provider-auth";

export const dynamic = "force-dynamic";

export function DELETE(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  return mutation(request, async (viewer) => {
    const { requestId } = await context.params;
    if (new URL(request.url).searchParams.get("dismiss") === "true") {
      return dismissFailedBackgroundResearch(viewer, requestId);
    }
    return cancelBackgroundResearch(viewer, requestId, {
      defer: waitUntil,
      providerAuth: providerAuthFromRequest(request),
    });
  });
}
