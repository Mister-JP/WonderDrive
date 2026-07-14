import { assertMutationOrigin, failure, readJson, success } from "../../../../lib/api";
import { resolveViewer, upgradeGuestJourneys } from "../../../../lib/viewer";

export async function POST(request: Request) {
  try {
    assertMutationOrigin(request);
    const viewer = await resolveViewer();
    const body = (await readJson(request)) as { idempotencyKey?: unknown };
    const result = await upgradeGuestJourneys(viewer, String(body.idempotencyKey ?? ""));
    const response = success({ transferred: result.transferred }, viewer);
    if (result.setCookie) response.headers.append("set-cookie", result.setCookie);
    return response;
  } catch (error) {
    return failure(error);
  }
}
