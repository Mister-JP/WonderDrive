CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`route` text NOT NULL,
	`key` text NOT NULL,
	`payload_hash` text NOT NULL,
	`response_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_keys_identity_route_key_unique` ON `idempotency_keys` (`identity_id`,`route`,`key`);--> statement-breakpoint
CREATE INDEX `idempotency_keys_expiry_idx` ON `idempotency_keys` (`expires_at`);--> statement-breakpoint
CREATE TABLE `research_events` (
	`id` text PRIMARY KEY NOT NULL,
	`research_run_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`kind` text NOT NULL,
	`label` text NOT NULL,
	`source_id` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`research_run_id`) REFERENCES `research_runs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_events_run_sequence_unique` ON `research_events` (`research_run_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `turn_interludes` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`fact_key` text NOT NULL,
	`text` text NOT NULL,
	`source_url` text NOT NULL,
	`source_title` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turn_interludes_turn_unique` ON `turn_interludes` (`turn_id`);--> statement-breakpoint
DROP INDEX `turn_options_turn_position_unique`;--> statement-breakpoint
ALTER TABLE `turn_options` ADD `set_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `turn_options_turn_set_position_unique` ON `turn_options` (`turn_id`,`set_version`,`position`);--> statement-breakpoint
ALTER TABLE `identities` ADD `last_seen_at` integer DEFAULT (unixepoch() * 1000) NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `title` text DEFAULT 'Untitled journey' NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `performer_id` text DEFAULT 'archivist' NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `model_id` text DEFAULT 'fixture-terra' NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `research_preset` text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `current_turn_id` text;--> statement-breakpoint
ALTER TABLE `journeys` ADD `turn_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `source_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `journeys` ADD `last_action` text;--> statement-breakpoint
ALTER TABLE `journeys` ADD `deleted_at` integer;--> statement-breakpoint
ALTER TABLE `turn_actions` ADD `payload_hash` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `turn_actions` ADD `result_turn_id` text REFERENCES turns(id);--> statement-breakpoint
ALTER TABLE `turn_actions` ADD `metadata_json` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `depth` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `turns` ADD `answer_json` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `research_summary` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `preferred_position` integer;--> statement-breakpoint
ALTER TABLE `turns` ADD `fixture_key` text;--> statement-breakpoint
ALTER TABLE `turns` ADD `option_set_version` integer DEFAULT 0 NOT NULL;