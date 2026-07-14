import { mutation, query, readJson } from "../../../lib/api";
import { getPreferences, updatePreferences } from "../../../lib/product-repository";

export async function GET() {
  return query(getPreferences);
}

export async function PUT(request: Request) {
  return mutation(request, async (viewer) => updatePreferences(viewer, await readJson(request)));
}
