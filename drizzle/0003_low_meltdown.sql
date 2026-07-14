CREATE TABLE `identity_upgrades` (
	`id` text PRIMARY KEY NOT NULL,
	`guest_identity_id` text NOT NULL,
	`account_identity_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`transferred_journey_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`guest_identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identity_upgrades_account_key_unique` ON `identity_upgrades` (`account_identity_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `interlude_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`fact_key` text NOT NULL,
	`text` text NOT NULL,
	`topic_tags_json` text NOT NULL,
	`source_url` text NOT NULL,
	`source_title` text NOT NULL,
	`verified_at` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interlude_facts_fact_key_unique` ON `interlude_facts` (`fact_key`);--> statement-breakpoint
CREATE TABLE `interlude_impressions` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`journey_id` text,
	`fact_key` text NOT NULL,
	`action` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `interlude_impressions_identity_idx` ON `interlude_impressions` (`identity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `journey_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`from_turn_id` text NOT NULL,
	`option_id` text,
	`to_turn_id` text,
	`action_id` text,
	`kind` text NOT NULL,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`option_id`) REFERENCES `turn_options`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`action_id`) REFERENCES `turn_actions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `journey_edges_journey_idx` ON `journey_edges` (`journey_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `journey_edges_action_option_unique` ON `journey_edges` (`action_id`,`option_id`,`kind`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`identity_id` text PRIMARY KEY NOT NULL,
	`answer_density` text DEFAULT 'balanced' NOT NULL,
	`text_size` text DEFAULT 'm' NOT NULL,
	`image_preference` text DEFAULT 'when-useful' NOT NULL,
	`speech_rate_percent` integer DEFAULT 100 NOT NULL,
	`reduce_motion` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`owner_identity_id` text NOT NULL,
	`label` text NOT NULL,
	`graph_version` integer NOT NULL,
	`summary` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`owner_identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `snapshots_journey_created_idx` ON `snapshots` (`journey_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`journey_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`research_run_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`web_search_calls` integer DEFAULT 0 NOT NULL,
	`page_fetches` integer DEFAULT 0 NOT NULL,
	`estimated_cost_microusd` integer DEFAULT 0 NOT NULL,
	`rate_effective_at` text NOT NULL,
	`provider_response_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`research_run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_events_run_unique` ON `usage_events` (`research_run_id`);--> statement-breakpoint
CREATE INDEX `usage_events_identity_created_idx` ON `usage_events` (`identity_id`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_identity_id` text,
	`seed` text NOT NULL,
	`title` text DEFAULT 'Untitled journey' NOT NULL,
	`performer_id` text DEFAULT 'sage' NOT NULL,
	`model_id` text DEFAULT 'fixture-terra' NOT NULL,
	`research_preset` text DEFAULT 'standard' NOT NULL,
	`answer_density` text DEFAULT 'balanced' NOT NULL,
	`image_preference` text DEFAULT 'when-useful' NOT NULL,
	`pinned` integer DEFAULT false NOT NULL,
	`hidden` integer DEFAULT false NOT NULL,
	`current_turn_id` text,
	`turn_count` integer DEFAULT 0 NOT NULL,
	`source_count` integer DEFAULT 0 NOT NULL,
	`last_action` text,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`owner_identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_journeys`("id", "owner_identity_id", "seed", "title", "performer_id", "model_id", "research_preset", "answer_density", "image_preference", "pinned", "hidden", "current_turn_id", "turn_count", "source_count", "last_action", "status", "version", "created_at", "updated_at", "deleted_at")
SELECT "id", "owner_identity_id", "seed", "title",
  CASE "performer_id"
    WHEN 'archivist' THEN 'sage'
    WHEN 'field-naturalist' THEN 'mechanist'
    WHEN 'systems-cartographer' THEN 'mechanist'
    ELSE "performer_id"
  END,
  "model_id", "research_preset", 'balanced', 'when-useful', 0, 0,
  "current_turn_id", "turn_count", "source_count", "last_action", "status", "version", "created_at", "updated_at", "deleted_at"
FROM `journeys`;--> statement-breakpoint
DROP TABLE `journeys`;--> statement-breakpoint
ALTER TABLE `__new_journeys` RENAME TO `journeys`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `journeys_owner_created_idx` ON `journeys` (`owner_identity_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `identities` ADD `expires_at` integer;--> statement-breakpoint
ALTER TABLE `identities` ADD `upgraded_to_identity_id` text;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `cached_input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `page_fetches` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `estimated_cost_microusd` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_runs` ADD `cached_input_tokens` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_runs` ADD `page_fetches` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_runs` ADD `estimated_cost_microusd` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_runs` ADD `rate_effective_at` text DEFAULT '2026-07-13' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_runs` ADD `lease_expires_at` integer;--> statement-breakpoint
ALTER TABLE `sources` ADD `published_at` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `provider_source_id` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `warning` text;--> statement-breakpoint
ALTER TABLE `sources` ADD `license_note` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `research_handoff_json` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `prompt_hash` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `performer_version` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `model_snapshot` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `answer_density` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `image_preference` text;
