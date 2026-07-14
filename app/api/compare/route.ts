import { query } from "../../../lib/api";
import { RepositoryError } from "../../../lib/errors";
import { compareJourneys } from "../../../lib/repository";

export async function GET(request: Request) {
  return query(async (viewer) => {
    const url = new URL(request.url);
    const left = url.searchParams.get("left");
    const right = url.searchParams.get("right");
    if (!left || !right) {
      throw new RepositoryError("BAD_REQUEST", "Choose two journeys to compare.", 400);
    }
    return compareJourneys(viewer, left, right);
  });
}
