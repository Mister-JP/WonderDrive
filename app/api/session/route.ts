import { query } from "../../../lib/api";
import { listJourneys } from "../../../lib/repository";

export async function GET() {
  return query(async (viewer) => ({ journeys: await listJourneys(viewer) }));
}
