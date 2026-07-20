import { getD1 } from "../db";
import type {
  AddBookmarkRequest,
  Bookmark,
  ImportBookmarksRequest,
  ImportBookmarksResult,
  LegacyBookmarkImportEntry,
  PerformerId,
} from "./contracts";
import { RepositoryError } from "./errors";
import { asRecord, assertId } from "./request";
import type { ViewerContext } from "./viewer";

type BookmarkRow = {
  id: string;
  journey_id: string;
  turn_id: string;
  created_at: number;
  question: string;
  topic_label: string | null;
  journey_seed: string;
  journey_title: string;
  performer_id: PerformerId;
  source_count: number;
};

const BOOKMARK_PROJECTION = `
  SELECT b.id, b.journey_id, b.turn_id, b.created_at,
         t.question, t.topic_label, j.seed AS journey_seed,
         j.title AS journey_title, j.performer_id,
         COUNT(DISTINCT ts.source_id) AS source_count
  FROM bookmarks b
  JOIN journeys j
    ON j.id = b.journey_id
   AND j.owner_identity_id = ?
   AND j.deleted_at IS NULL
  JOIN turns t
    ON t.id = b.turn_id
   AND t.journey_id = j.id
   AND t.status = 'ready'
  LEFT JOIN turn_sources ts ON ts.turn_id = t.id`;

export async function listBookmarks(viewer: ViewerContext): Promise<Bookmark[]> {
  const result = await getD1()
    .prepare(`${BOOKMARK_PROJECTION}
      WHERE b.identity_id = ?
      GROUP BY b.id, b.journey_id, b.turn_id, b.created_at, t.question,
               t.topic_label, j.seed, j.title, j.performer_id
      ORDER BY b.created_at DESC, b.id DESC`)
    .bind(viewer.identityId, viewer.identityId)
    .all<BookmarkRow>();
  return result.results.map(projectBookmark);
}

export async function addBookmark(
  viewer: ViewerContext,
  value: unknown,
): Promise<Bookmark> {
  const request = parseAddRequest(value);
  const db = getD1();
  const now = Date.now();
  await db
    .prepare(
      `INSERT OR IGNORE INTO bookmarks (id, identity_id, journey_id, turn_id, created_at)
       SELECT ?, ?, j.id, t.id, ?
       FROM journeys j
       JOIN turns t ON t.journey_id = j.id
       WHERE j.id = ? AND j.owner_identity_id = ? AND j.deleted_at IS NULL
         AND t.id = ? AND t.status = 'ready'`,
    )
    .bind(
      crypto.randomUUID(),
      viewer.identityId,
      now,
      request.journeyId,
      viewer.identityId,
      request.turnId,
    )
    .run();
  const bookmark = await readBookmark(db, viewer, request.turnId);
  if (!bookmark) {
    throw new RepositoryError("NOT_FOUND", "That saved question was not found.", 404);
  }
  return bookmark;
}

export async function removeBookmark(
  viewer: ViewerContext,
  turnId: unknown,
): Promise<{ turnId: string }> {
  assertId(turnId, "turn");
  await getD1()
    .prepare("DELETE FROM bookmarks WHERE identity_id = ? AND turn_id = ?")
    .bind(viewer.identityId, turnId)
    .run();
  return { turnId };
}

export async function importBookmarks(
  viewer: ViewerContext,
  value: unknown,
): Promise<ImportBookmarksResult> {
  const entries = parseImportRequest(value);
  const db = getD1();
  const statements = entries.map((entry) => db
    .prepare(
      `INSERT OR IGNORE INTO bookmarks (id, identity_id, journey_id, turn_id, created_at)
       SELECT ?, ?, j.id, t.id, ?
       FROM journeys j
       JOIN turns t ON t.journey_id = j.id
       WHERE j.id = ? AND j.owner_identity_id = ? AND j.deleted_at IS NULL
         AND t.id = ? AND t.status = 'ready'`,
    )
    .bind(
      crypto.randomUUID(),
      viewer.identityId,
      entry.savedAt,
      entry.journeyId,
      viewer.identityId,
      entry.turnId,
    ));
  const results = statements.length ? await db.batch(statements) : [];
  return {
    imported: results.reduce((sum, result) => sum + (result.meta.changes ?? 0), 0),
    bookmarks: await listBookmarks(viewer),
  };
}

async function readBookmark(
  db: D1Database,
  viewer: ViewerContext,
  turnId: string,
): Promise<Bookmark | null> {
  const row = await db
    .prepare(`${BOOKMARK_PROJECTION}
      WHERE b.identity_id = ? AND b.turn_id = ?
      GROUP BY b.id, b.journey_id, b.turn_id, b.created_at, t.question,
               t.topic_label, j.seed, j.title, j.performer_id
      LIMIT 1`)
    .bind(viewer.identityId, viewer.identityId, turnId)
    .first<BookmarkRow>();
  return row ? projectBookmark(row) : null;
}

function parseAddRequest(value: unknown): AddBookmarkRequest {
  const body = asRecord(value);
  assertId(body.journeyId, "journey");
  assertId(body.turnId, "turn");
  return { journeyId: body.journeyId, turnId: body.turnId };
}

function parseImportRequest(value: unknown): LegacyBookmarkImportEntry[] {
  const body = asRecord(value) as Record<string, unknown> & Partial<ImportBookmarksRequest>;
  if (!Array.isArray(body.entries) || body.entries.length > 500) {
    throw new RepositoryError(
      "BAD_REQUEST",
      "Legacy bookmarks must be an array of at most 500 entries.",
      400,
    );
  }
  const now = Date.now();
  const unique = new Map<string, LegacyBookmarkImportEntry>();
  for (const rawEntry of body.entries) {
    const entry = asRecord(rawEntry);
    assertId(entry.journeyId, "journey");
    assertId(entry.turnId, "turn");
    if (
      typeof entry.savedAt !== "number"
      || !Number.isSafeInteger(entry.savedAt)
      || entry.savedAt < 1
      || entry.savedAt > now + 5 * 60 * 1000
    ) {
      throw new RepositoryError("BAD_REQUEST", "A valid bookmark save time is required.", 400);
    }
    const candidate = {
      journeyId: entry.journeyId,
      turnId: entry.turnId,
      savedAt: entry.savedAt,
    };
    const prior = unique.get(candidate.turnId);
    if (!prior || candidate.savedAt < prior.savedAt) unique.set(candidate.turnId, candidate);
  }
  return [...unique.values()];
}

function projectBookmark(row: BookmarkRow): Bookmark {
  return {
    id: row.id,
    journeyId: row.journey_id,
    turnId: row.turn_id,
    bookmarkedAt: row.created_at,
    question: row.question,
    topicLabel: row.topic_label?.trim() || row.question,
    journeySeed: row.journey_seed,
    journeyTitle: row.journey_title,
    performerId: row.performer_id,
    sourceCount: Number(row.source_count),
  };
}
