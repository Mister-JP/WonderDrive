import { query } from "../../../../lib/api";
import { getResearchStatus } from "../../../../lib/product-repository";

type Context = { params: Promise<{ runId: string }> };

export async function GET(_request: Request, context: Context) {
  return query(async (viewer) => {
    const { runId } = await context.params;
    return getResearchStatus(viewer, runId);
  });
}
