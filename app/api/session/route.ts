import { failure, success } from "../../../lib/api";
import { listJourneys } from "../../../lib/repository";
import { resolveViewer } from "../../../lib/viewer";

export async function GET() {
  try {
    const viewer = await resolveViewer();
    const journeys = await listJourneys(viewer);
    return success({ journeys }, viewer);
  } catch (error) {
    return failure(error);
  }
}
