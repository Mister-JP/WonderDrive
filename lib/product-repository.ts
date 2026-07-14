import { BOOTSTRAP_CATALOG, DEFAULT_PREFERENCES } from "./catalog";
import type {
  JourneyDetail,
  JourneySnapshot,
  UserPreferences,
} from "./contracts";
import { getD1 } from "../db";
import { getJourney } from "./repository";
import { RepositoryError } from "./errors";
import { asRecord } from "./request";
import type { ViewerContext } from "./viewer";

type PreferencesRow = {
  answer_density: UserPreferences["answerDensity"];
  text_size: UserPreferences["textSize"];
  image_preference: UserPreferences["imagePreference"];
  speech_rate_percent: number;
  reduce_motion: number;
};

export async function getPreferences(viewer: ViewerContext): Promise<UserPreferences> {
  const row = await getD1()
    .prepare(
      `SELECT answer_density, text_size, image_preference, speech_rate_percent, reduce_motion
       FROM preferences WHERE identity_id = ? LIMIT 1`,
    )
    .bind(viewer.identityId)
    .first<PreferencesRow>();
  return row
    ? {
        answerDensity: row.answer_density,
        textSize: row.text_size,
        imagePreference: row.image_preference,
        speechRate: Math.min(2, Math.max(0.5, row.speech_rate_percent / 100)),
        reduceMotion: Boolean(row.reduce_motion),
      }
    : DEFAULT_PREFERENCES;
}

export async function updatePreferences(
  viewer: ViewerContext,
  value: unknown,
): Promise<UserPreferences> {
  const preferences = validatePreferences(value);
  await getD1()
    .prepare(
      `INSERT INTO preferences
        (identity_id, answer_density, text_size, image_preference, speech_rate_percent,
         reduce_motion, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(identity_id) DO UPDATE SET
         answer_density = excluded.answer_density,
         text_size = excluded.text_size,
         image_preference = excluded.image_preference,
         speech_rate_percent = excluded.speech_rate_percent,
         reduce_motion = excluded.reduce_motion,
         updated_at = excluded.updated_at`,
    )
    .bind(
      viewer.identityId,
      preferences.answerDensity,
      preferences.textSize,
      preferences.imagePreference,
      Math.round(preferences.speechRate * 100),
      preferences.reduceMotion ? 1 : 0,
      Date.now(),
    )
    .run();
  return preferences;
}

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
    throw new RepositoryError("BAD_REQUEST", "Keep the journey title between 1 and 100 characters.", 400);
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

export async function createSnapshot(
  viewer: ViewerContext,
  journeyId: string,
  labelValue: unknown,
): Promise<JourneySnapshot> {
  const journey = await getJourney(viewer, journeyId);
  const label =
    typeof labelValue === "string" && labelValue.trim()
      ? labelValue.trim().replace(/\s+/g, " ").slice(0, 80)
      : `Snapshot ${new Date().toLocaleDateString("en-US")}`;
  const current = journey.turns.find((turn) => turn.id === journey.currentTurnId) ?? journey.turns.at(-1);
  const unresolved = current?.researchHandoff.unresolvedThreads.slice(0, 2) ?? [];
  const surprise = journey.turns
    .flatMap((turn) => turn.researchHandoff.discoveries)
    .find(Boolean);
  const summary = [
    `${journey.title} has visited ${journey.topicLabels.join(", ") || "an opening question"} across ${journey.turnCount} turn${journey.turnCount === 1 ? "" : "s"}.`,
    current ? `The active route currently rests at “${current.question}”.` : "",
    surprise ? `A notable discovery: ${surprise}` : "",
    unresolved.length ? `Still open: ${unresolved.join("; ")}` : "",
    `${journey.openBranchCount} visible branch${journey.openBranchCount === 1 ? " remains" : "es remain"} open.`,
  ]
    .filter(Boolean)
    .join(" ");
  const snapshot: JourneySnapshot = {
    id: crypto.randomUUID(),
    journeyId,
    label,
    graphVersion: journey.version,
    summary,
    createdAt: Date.now(),
  };
  await getD1()
    .prepare(
      `INSERT INTO snapshots
        (id, journey_id, owner_identity_id, label, graph_version, summary, snapshot_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      snapshot.id,
      journeyId,
      viewer.identityId,
      snapshot.label,
      snapshot.graphVersion,
      snapshot.summary,
      JSON.stringify({ topicLabels: journey.topicLabels, currentTurnId: journey.currentTurnId }),
      snapshot.createdAt,
    )
    .run();
  return snapshot;
}

export async function listSnapshots(
  viewer: ViewerContext,
  journeyId: string,
): Promise<JourneySnapshot[]> {
  await getJourney(viewer, journeyId);
  const result = await getD1()
    .prepare(
      `SELECT id, journey_id, label, graph_version, summary, created_at
       FROM snapshots WHERE journey_id = ? AND owner_identity_id = ? ORDER BY created_at DESC`,
    )
    .bind(journeyId, viewer.identityId)
    .all<{
      id: string;
      journey_id: string;
      label: string;
      graph_version: number;
      summary: string;
      created_at: number;
    }>();
  return result.results.map((row) => ({
    id: row.id,
    journeyId: row.journey_id,
    label: row.label,
    graphVersion: row.graph_version,
    summary: row.summary,
    createdAt: row.created_at,
  }));
}

export async function exportJourney(viewer: ViewerContext, journeyId: string) {
  const [journey, snapshots] = await Promise.all([
    getJourney(viewer, journeyId),
    listSnapshots(viewer, journeyId),
  ]);
  return {
    exportVersion: "wonderdrive-export@1",
    exportedAt: new Date().toISOString(),
    catalogVersion: BOOTSTRAP_CATALOG.promptVersion,
    journey,
    snapshots,
    privacy: {
      includes: "Visible journey content, actions, sources, metadata, and saved snapshots.",
      excludes: "API keys, cookies, private provider reasoning, raw source bodies, and internal prompts.",
    },
  };
}

export async function getResearchStatus(viewer: ViewerContext, requestId: string) {
  const row = await getD1()
    .prepare(
      `SELECT status, result_journey_id, result_turn_id, error_code, error_message, completed_at
       FROM research_requests WHERE id = ? AND identity_id = ? LIMIT 1`,
    )
    .bind(requestId, viewer.identityId)
    .first<{
      status: string;
      result_journey_id: string | null;
      result_turn_id: string | null;
      error_code: string | null;
      error_message: string | null;
      completed_at: number | null;
    }>();
  if (!row) throw new RepositoryError("NOT_FOUND", "That research run was not found.", 404);
  return {
    status: row.status,
    journeyId: row.result_journey_id,
    turnId: row.result_turn_id,
    error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
    completedAt: row.completed_at,
  };
}

function validatePreferences(value: unknown): UserPreferences {
  const body = asRecord(value);
  const answerDensity = body.answerDensity;
  const textSize = body.textSize;
  const imagePreference = body.imagePreference;
  const speechRate = body.speechRate;
  const reduceMotion = body.reduceMotion;
  if (!["brief", "balanced", "rich"].includes(String(answerDensity))) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported answer density.", 400);
  }
  if (!["s", "m", "l", "xl"].includes(String(textSize))) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported text size.", 400);
  }
  if (!["avoid", "when-useful", "prefer"].includes(String(imagePreference))) {
    throw new RepositoryError("BAD_REQUEST", "Choose a supported image preference.", 400);
  }
  if (typeof speechRate !== "number" || !Number.isFinite(speechRate) || speechRate < 0.5 || speechRate > 2) {
    throw new RepositoryError("BAD_REQUEST", "Speech speed must be between 0.5× and 2×.", 400);
  }
  if (typeof reduceMotion !== "boolean") {
    throw new RepositoryError("BAD_REQUEST", "Reduced motion must be true or false.", 400);
  }
  return {
    answerDensity: answerDensity as UserPreferences["answerDensity"],
    textSize: textSize as UserPreferences["textSize"],
    imagePreference: imagePreference as UserPreferences["imagePreference"],
    speechRate,
    reduceMotion,
  };
}
