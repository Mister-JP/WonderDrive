import { BOOTSTRAP_CATALOG } from "../../../lib/catalog";
import { query } from "../../../lib/api";
import { getPreferences } from "../../../lib/product-repository";

export async function GET() {
  return query(async (viewer) => ({
    catalog: BOOTSTRAP_CATALOG,
    preferences: await getPreferences(viewer),
  }));
}
