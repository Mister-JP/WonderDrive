import { query } from "../../../lib/api";
import { PERFORMERS } from "../../../lib/catalog";
import type { PerformerId } from "../../../lib/contracts";
import { getPersonalizedStarters } from "../../../lib/starter-recommendations";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("performer");
  const performerId = PERFORMERS.some((performer) => performer.id === requested)
    ? requested as PerformerId
    : "sage";
  return query(async (viewer) => ({ starters: await getPersonalizedStarters(viewer, performerId) }));
}
