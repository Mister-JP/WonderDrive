import { mutation, readJson } from "../../../../lib/api";
import { upgradeGuestJourneys } from "../../../../lib/viewer";

export async function POST(request: Request) {
  return mutation(request, async (viewer) => {
    const body = await readJson<{ idempotencyKey?: unknown }>(request);
    const result = await upgradeGuestJourneys(viewer, String(body.idempotencyKey ?? ""));
    if (result.setCookie) viewer.setCookie = result.setCookie;
    return { transferred: result.transferred };
  });
}
