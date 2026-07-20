import type { JourneyDetail } from "./contracts";
import { getD1 } from "../db";
import { RepositoryError } from "./errors";
import { getJourney } from "./repository";
import { asRecord } from "./request";
import type { ViewerContext } from "./viewer";

export async function updateJourneyManagement(
  viewer: ViewerContext,
  journeyId: string,
  value: unknown,
): Promise<JourneyDetail> {
  const body = asRecord(value);
  const title = typeof body.title === "string" ? body.title.trim().replace(/\s+/g, " ") : undefined;
  const pinned = typeof body.pinned === "boolean" ? body.pinned : undefined;
  const hidden = typeof body.hidden === "boolean" ? body.hidden : undefined;
  if (title !== undefined && (title.length < 1 || title.length > 100)) {
    throw new RepositoryError("BAD_REQUEST", "Keep the journey label between 1 and 100 characters.", 400);
  }
  if (title === undefined && pinned === undefined && hidden === undefined) {
    throw new RepositoryError("BAD_REQUEST", "Choose a journey setting to update.", 400);
  }
  const current = await getJourney(viewer, journeyId);
  const result = await getD1()
    .prepare(
      `UPDATE journeys SET title = ?, pinned = ?, hidden = ?, version = version + 1, updated_at = ?
       WHERE id = ? AND owner_identity_id = ? AND version = ? AND deleted_at IS NULL`,
    )
    .bind(
      title ?? current.title,
      pinned === undefined ? (current.pinned ? 1 : 0) : pinned ? 1 : 0,
      hidden === undefined ? (current.hidden ? 1 : 0) : hidden ? 1 : 0,
      Date.now(),
      journeyId,
      viewer.identityId,
      current.version,
    )
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new RepositoryError("VERSION_CONFLICT", "The journey changed before it could be updated.", 409, true);
  }
  return getJourney(viewer, journeyId);
}
