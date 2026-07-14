import { mutation, query, readJson } from "../../../../../lib/api";
import { createSnapshot, listSnapshots } from "../../../../../lib/product-repository";

type Context = { params: Promise<{ journeyId: string }> };

export async function GET(_request: Request, context: Context) {
  return query(async (viewer) => {
    const { journeyId } = await context.params;
    return listSnapshots(viewer, journeyId);
  });
}

export async function POST(request: Request, context: Context) {
  return mutation(request, async (viewer) => {
    const { journeyId } = await context.params;
    const body = await readJson<{ label?: unknown }>(request);
    return createSnapshot(viewer, journeyId, body.label);
  }, 201);
}
