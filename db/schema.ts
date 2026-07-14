import { sql } from "drizzle-orm";
import {
  AnySQLiteColumn,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const createdAt = integer("created_at", { mode: "timestamp_ms" })
  .notNull()
  .default(sql`(unixepoch() * 1000)`);

export const identities = sqliteTable(
  "identities",
  {
    id: text("id").primaryKey(),
    provider: text("provider", { enum: ["chatgpt", "guest"] }).notNull(),
    providerSubject: text("provider_subject").notNull(),
    createdAt,
    lastSeenAt: integer("last_seen_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("identities_provider_subject_unique").on(
      table.provider,
      table.providerSubject,
    ),
  ],
);

export const journeys = sqliteTable(
  "journeys",
  {
    id: text("id").primaryKey(),
    ownerIdentityId: text("owner_identity_id").references(() => identities.id),
    seed: text("seed").notNull(),
    title: text("title").notNull().default("Untitled journey"),
    performerId: text("performer_id").notNull().default("archivist"),
    modelId: text("model_id").notNull().default("fixture-terra"),
    researchPreset: text("research_preset", {
      enum: ["spark", "standard", "deep"],
    })
      .notNull()
      .default("standard"),
    currentTurnId: text("current_turn_id"),
    turnCount: integer("turn_count").notNull().default(0),
    sourceCount: integer("source_count").notNull().default(0),
    lastAction: text("last_action"),
    status: text("status", { enum: ["active", "paused", "deleted"] })
      .notNull()
      .default("active"),
    version: integer("version").notNull().default(1),
    createdAt,
    updatedAt: integer("updated_at", { mode: "timestamp_ms" })
      .notNull()
      .default(sql`(unixepoch() * 1000)`),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("journeys_owner_created_idx").on(table.ownerIdentityId, table.createdAt)],
);

export const turns = sqliteTable(
  "turns",
  {
    id: text("id").primaryKey(),
    journeyId: text("journey_id")
      .notNull()
      .references(() => journeys.id),
    parentTurnId: text("parent_turn_id").references(
      (): AnySQLiteColumn => turns.id,
    ),
    depth: integer("depth").notNull().default(0),
    question: text("question").notNull(),
    status: text("status", {
      enum: ["pending", "ready", "failed"],
    })
      .notNull()
      .default("pending"),
    answer: text("answer"),
    answerJson: text("answer_json"),
    transition: text("transition"),
    topicLabel: text("topic_label"),
    researchSummary: text("research_summary"),
    preferredPosition: integer("preferred_position"),
    fixtureKey: text("fixture_key"),
    optionSetVersion: integer("option_set_version").notNull().default(0),
    provider: text("provider"),
    modelId: text("model_id"),
    promptVersion: text("prompt_version"),
    createdAt,
    readyAt: integer("ready_at", { mode: "timestamp_ms" }),
  },
  (table) => [
    index("turns_journey_created_idx").on(table.journeyId, table.createdAt),
    index("turns_parent_idx").on(table.parentTurnId),
  ],
);

export const turnOptions = sqliteTable(
  "turn_options",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id")
      .notNull()
      .references(() => turns.id),
    setVersion: integer("set_version").notNull().default(0),
    position: integer("position").notNull(),
    question: text("question").notNull(),
    angle: text("angle").notNull(),
    state: text("state", {
      enum: ["proposed", "chosen", "rejected", "superseded"],
    })
      .notNull()
      .default("proposed"),
  },
  (table) => [
    uniqueIndex("turn_options_turn_set_position_unique").on(
      table.turnId,
      table.setVersion,
      table.position,
    ),
  ],
);

export const turnActions = sqliteTable(
  "turn_actions",
  {
    id: text("id").primaryKey(),
    journeyId: text("journey_id")
      .notNull()
      .references(() => journeys.id),
    turnId: text("turn_id")
      .notNull()
      .references(() => turns.id),
    kind: text("kind", {
      enum: ["choose", "reject", "delegate", "branch", "pause"],
    }).notNull(),
    optionId: text("option_id").references(() => turnOptions.id),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull().default(""),
    resultTurnId: text("result_turn_id").references(() => turns.id),
    metadataJson: text("metadata_json"),
    createdAt,
  },
  (table) => [
    uniqueIndex("turn_actions_journey_idempotency_unique").on(
      table.journeyId,
      table.idempotencyKey,
    ),
  ],
);

export const researchRuns = sqliteTable(
  "research_runs",
  {
    id: text("id").primaryKey(),
    journeyId: text("journey_id")
      .notNull()
      .references(() => journeys.id),
    turnId: text("turn_id")
      .notNull()
      .references(() => turns.id),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    preset: text("preset", { enum: ["spark", "standard", "deep"] }).notNull(),
    status: text("status", {
      enum: ["reserved", "researching", "validating", "ready", "failed", "interrupted"],
    })
      .notNull()
      .default("reserved"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt,
  },
  (table) => [
    uniqueIndex("research_runs_turn_unique").on(table.turnId),
    index("research_runs_journey_status_idx").on(table.journeyId, table.status),
  ],
);

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title"),
    publisher: text("publisher"),
    retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("sources_canonical_url_unique").on(table.canonicalUrl)],
);

export const turnSources = sqliteTable(
  "turn_sources",
  {
    turnId: text("turn_id")
      .notNull()
      .references(() => turns.id),
    sourceId: text("source_id")
      .notNull()
      .references(() => sources.id),
    relation: text("relation", {
      enum: ["consulted", "cited", "image"],
    }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.turnId, table.sourceId, table.relation] })],
);

export const researchEvents = sqliteTable(
  "research_events",
  {
    id: text("id").primaryKey(),
    researchRunId: text("research_run_id")
      .notNull()
      .references(() => researchRuns.id),
    sequence: integer("sequence").notNull(),
    kind: text("kind", {
      enum: ["search", "source", "check", "synthesis", "status"],
    }).notNull(),
    label: text("label").notNull(),
    sourceId: text("source_id").references(() => sources.id),
    createdAt,
  },
  (table) => [
    uniqueIndex("research_events_run_sequence_unique").on(
      table.researchRunId,
      table.sequence,
    ),
  ],
);

export const turnInterludes = sqliteTable(
  "turn_interludes",
  {
    id: text("id").primaryKey(),
    turnId: text("turn_id")
      .notNull()
      .references(() => turns.id),
    factKey: text("fact_key").notNull(),
    text: text("text").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceTitle: text("source_title").notNull(),
    createdAt,
  },
  (table) => [uniqueIndex("turn_interludes_turn_unique").on(table.turnId)],
);

export const idempotencyKeys = sqliteTable(
  "idempotency_keys",
  {
    id: text("id").primaryKey(),
    identityId: text("identity_id")
      .notNull()
      .references(() => identities.id),
    route: text("route").notNull(),
    key: text("key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    responseId: text("response_id").notNull(),
    createdAt,
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("idempotency_keys_identity_route_key_unique").on(
      table.identityId,
      table.route,
      table.key,
    ),
    index("idempotency_keys_expiry_idx").on(table.expiresAt),
  ],
);
