import { failure, success } from "../../../lib/api";
import { compareJourneys, RepositoryError } from "../../../lib/repository";
import { resolveViewer } from "../../../lib/viewer";

export async function GET(request: Request) {
  try {
    const viewer = await resolveViewer();
    const url = new URL(request.url);
    const left = url.searchParams.get("left");
    const right = url.searchParams.get("right");
    if (!left || !right) {
      throw new RepositoryError("BAD_REQUEST", "Choose two journeys to compare.", 400);
    }
    return success(await compareJourneys(viewer, left, right), viewer);
  } catch (error) {
    return failure(error);
  }
}
