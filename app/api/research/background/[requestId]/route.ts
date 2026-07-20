import { waitUntil } from "cloudflare:workers";
import { mutation } from "../../../../../lib/api";
import { cancelBackgroundResearch } from "../../../../../lib/background-research";

export const dynamic = "force-dynamic";

export function DELETE(
  request: Request,
  context: { params: Promise<{ requestId: string }> },
) {
  return mutation(request, async (viewer) => {
    const { requestId } = await context.params;
    return cancelBackgroundResearch(viewer, requestId, { defer: waitUntil });
  });
}
