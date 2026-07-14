import { failure } from "../../../../../lib/api";
import { exportJourney } from "../../../../../lib/product-repository";
import { resolveViewer } from "../../../../../lib/viewer";

type Context = { params: Promise<{ journeyId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const viewer = await resolveViewer();
    const { journeyId } = await context.params;
    const payload = await exportJourney(viewer, journeyId);
    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": `attachment; filename="wonderdrive-${journeyId}.json"`,
        "content-type": "application/json; charset=utf-8",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return failure(error);
  }
}
