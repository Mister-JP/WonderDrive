import { PROMPT_VERSION } from "./catalog";
import type { JourneySnapshot } from "./contracts";
import { getD1 } from "../db";
import { getJourney } from "./repository";
import type { ViewerContext } from "./viewer";

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
    exportVersion: "curiositypedia-export@1",
    exportedAt: new Date().toISOString(),
    catalogVersion: PROMPT_VERSION,
    journey,
    snapshots,
    privacy: {
      includes: "Visible journey content, actions, sources, metadata, and saved snapshots.",
      excludes: "API keys, cookies, private provider reasoning, raw source bodies, and internal prompts.",
    },
  };
}
