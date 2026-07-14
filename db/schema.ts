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
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    upgradedToIdentityId: text("upgraded_to_identity_id"),
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

export const preferences = sqliteTable("preferences", {
  identityId: text("identity_id")
    .primaryKey()
    .references(() => identities.id),
  answerDensity: text("answer_density", {
    enum: ["brief", "balanced", "rich"],
  })
    .notNull()
    .default("balanced"),
  textSize: text("text_size", { enum: ["s", "m", "l", "xl"] })
    .notNull()
    .default("m"),
  imagePreference: text("image_preference", {
    enum: ["avoid", "when-useful", "prefer"],
  })
    .notNull()
    .default("when-useful"),
  speechRate: integer("speech_rate_percent").notNull().default(100),
  reduceMotion: integer("reduce_motion", { mode: "boolean" }).notNull().default(false),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const starterRecommendations = sqliteTable("starter_recommendations", {
  identityId: text("identity_id")
    .primaryKey()
    .references(() => identities.id),
  historyHash: text("history_hash").notNull(),
  questionsJson: text("questions_json").notNull(),
  generatedAt: integer("generated_at", { mode: "timestamp_ms" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
});

export const journeys = sqliteTable(
  "journeys",
  {
    id: text("id").primaryKey(),
    ownerIdentityId: text("owner_identity_id").references(() => identities.id),
    seed: text("seed").notNull(),
    title: text("title").notNull().default("Untitled journey"),
    performerId: text("performer_id").notNull().default("sage"),
    modelId: text("model_id").notNull().default("fixture-terra"),
    researchPreset: text("research_preset", {
      enum: ["spark", "standard", "deep"],
    })
      .notNull()
      .default("standard"),
    answerDensity: text("answer_density", {
      enum: ["brief", "balanced", "rich"],
    })
      .notNull()
      .default("balanced"),
    imagePreference: text("image_preference", {
      enum: ["avoid", "when-useful", "prefer"],
    })
      .notNull()
      .default("when-useful"),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
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
    researchHandoffJson: text("research_handoff_json"),
    preferredPosition: integer("preferred_position"),
    fixtureKey: text("fixture_key"),
    optionSetVersion: integer("option_set_version").notNull().default(0),
    provider: text("provider"),
    modelId: text("model_id"),
    promptVersion: text("prompt_version"),
    promptHash: text("prompt_hash"),
    performerVersion: text("performer_version"),
    modelSnapshot: text("model_snapshot"),
    answerDensity: text("answer_density", {
      enum: ["brief", "balanced", "rich"],
    }),
    imagePreference: text("image_preference", {
      enum: ["avoid", "when-useful", "prefer"],
    }),
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
    providerResponseId: text("provider_response_id"),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    webSearchCalls: integer("web_search_calls").notNull().default(0),
    pageFetches: integer("page_fetches").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    estimatedCostMicrousd: integer("estimated_cost_microusd").notNull().default(0),
    rateEffectiveAt: text("rate_effective_at").notNull().default("2026-07-13"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt,
  },
  (table) => [
    uniqueIndex("research_runs_turn_unique").on(table.turnId),
    index("research_runs_journey_status_idx").on(table.journeyId, table.status),
  ],
);

export const researchRequests = sqliteTable(
  "research_requests",
  {
    id: text("id").primaryKey(),
    identityId: text("identity_id")
      .notNull()
      .references(() => identities.id),
    kind: text("kind", { enum: ["create", "advance"] }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    payloadHash: text("payload_hash").notNull(),
    requestJson: text("request_json").notNull(),
    status: text("status", {
      enum: ["reserved", "researching", "committed", "failed"],
    })
      .notNull()
      .default("reserved"),
    providerResponseId: text("provider_response_id"),
    resultJourneyId: text("result_journey_id").references(() => journeys.id),
    resultTurnId: text("result_turn_id").references(() => turns.id),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    webSearchCalls: integer("web_search_calls").notNull().default(0),
    pageFetches: integer("page_fetches").notNull().default(0),
    estimatedCostMicrousd: integer("estimated_cost_microusd").notNull().default(0),
    startedAt: integer("started_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    createdAt,
  },
  (table) => [
    uniqueIndex("research_requests_identity_key_unique").on(
      table.identityId,
      table.idempotencyKey,
    ),
    index("research_requests_identity_created_idx").on(table.identityId, table.createdAt),
  ],
);

export const sources = sqliteTable(
  "sources",
  {
    id: text("id").primaryKey(),
    canonicalUrl: text("canonical_url").notNull(),
    title: text("title"),
    publisher: text("publisher"),
    publishedAt: text("published_at"),
    providerSourceId: text("provider_source_id"),
    warning: text("warning"),
    licenseNote: text("license_note"),
    retrievedAt: integer("retrieved_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [uniqueIndex("sources_canonical_url_unique").on(table.canonicalUrl)],
);

export const journeyEdges = sqliteTable(
  "journey_edges",
  {
    id: text("id").primaryKey(),
    journeyId: text("journey_id").notNull().references(() => journeys.id),
    fromTurnId: text("from_turn_id").notNull().references(() => turns.id),
    optionId: text("option_id").references(() => turnOptions.id),
    toTurnId: text("to_turn_id").references(() => turns.id),
    actionId: text("action_id").references(() => turnActions.id),
    kind: text("kind", {
      enum: ["chosen", "unchosen", "rejected", "delegated", "reconnected"],
    }).notNull(),
    metadataJson: text("metadata_json"),
    createdAt,
  },
  (table) => [
    index("journey_edges_journey_idx").on(table.journeyId, table.createdAt),
    uniqueIndex("journey_edges_action_option_unique").on(table.actionId, table.optionId, table.kind),
  ],
);

export const usageEvents = sqliteTable(
  "usage_events",
  {
    id: text("id").primaryKey(),
    identityId: text("identity_id").notNull().references(() => identities.id),
    journeyId: text("journey_id").notNull().references(() => journeys.id),
    turnId: text("turn_id").notNull().references(() => turns.id),
    researchRunId: text("research_run_id").notNull().references(() => researchRuns.id),
    provider: text("provider").notNull(),
    modelId: text("model_id").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    cachedInputTokens: integer("cached_input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    reasoningTokens: integer("reasoning_tokens").notNull().default(0),
    webSearchCalls: integer("web_search_calls").notNull().default(0),
    pageFetches: integer("page_fetches").notNull().default(0),
    estimatedCostMicrousd: integer("estimated_cost_microusd").notNull().default(0),
    rateEffectiveAt: text("rate_effective_at").notNull(),
    providerResponseId: text("provider_response_id"),
    createdAt,
  },
  (table) => [
    uniqueIndex("usage_events_run_unique").on(table.researchRunId),
    index("usage_events_identity_created_idx").on(table.identityId, table.createdAt),
  ],
);

export const snapshots = sqliteTable(
  "snapshots",
  {
    id: text("id").primaryKey(),
    journeyId: text("journey_id").notNull().references(() => journeys.id),
    ownerIdentityId: text("owner_identity_id").notNull().references(() => identities.id),
    label: text("label").notNull(),
    graphVersion: integer("graph_version").notNull(),
    summary: text("summary").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    createdAt,
  },
  (table) => [index("snapshots_journey_created_idx").on(table.journeyId, table.createdAt)],
);

// Legacy Phase 1 tables remain declared so future migrations do not drop deployed data.
// No current runtime path reads or writes them.
export const interludeFacts = sqliteTable("interlude_facts", {
  id: text("id").primaryKey(),
  factKey: text("fact_key").notNull().unique(),
  text: text("text").notNull(),
  topicTagsJson: text("topic_tags_json").notNull(),
  sourceUrl: text("source_url").notNull(),
  sourceTitle: text("source_title").notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp_ms" }).notNull(),
  status: text("status", { enum: ["active", "retired"] }).notNull().default("active"),
  createdAt,
});

export const interludeImpressions = sqliteTable(
  "interlude_impressions",
  {
    id: text("id").primaryKey(),
    identityId: text("identity_id").notNull().references(() => identities.id),
    journeyId: text("journey_id").references(() => journeys.id),
    factKey: text("fact_key").notNull(),
    action: text("action", { enum: ["shown", "next", "saved"] }).notNull(),
    createdAt,
  },
  (table) => [index("interlude_impressions_identity_idx").on(table.identityId, table.createdAt)],
);

export const identityUpgrades = sqliteTable(
  "identity_upgrades",
  {
    id: text("id").primaryKey(),
    guestIdentityId: text("guest_identity_id").notNull().references(() => identities.id),
    accountIdentityId: text("account_identity_id").notNull().references(() => identities.id),
    idempotencyKey: text("idempotency_key").notNull(),
    transferredJourneyCount: integer("transferred_journey_count").notNull().default(0),
    createdAt,
  },
  (table) => [
    uniqueIndex("identity_upgrades_account_key_unique").on(
      table.accountIdentityId,
      table.idempotencyKey,
    ),
  ],
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

// Legacy per-turn records are retained for migration compatibility only.
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
