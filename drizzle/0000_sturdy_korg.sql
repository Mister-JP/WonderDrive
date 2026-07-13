CREATE TABLE `identities` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_subject` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `identities_provider_subject_unique` ON `identities` (`provider`,`provider_subject`);--> statement-breakpoint
CREATE TABLE `journeys` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_identity_id` text,
	`seed` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`owner_identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `journeys_owner_created_idx` ON `journeys` (`owner_identity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `research_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`preset` text NOT NULL,
	`status` text DEFAULT 'reserved' NOT NULL,
	`started_at` integer,
	`completed_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `research_runs_turn_unique` ON `research_runs` (`turn_id`);--> statement-breakpoint
CREATE INDEX `research_runs_journey_status_idx` ON `research_runs` (`journey_id`,`status`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_url` text NOT NULL,
	`title` text,
	`publisher` text,
	`retrieved_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sources_canonical_url_unique` ON `sources` (`canonical_url`);--> statement-breakpoint
CREATE TABLE `turn_actions` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`kind` text NOT NULL,
	`option_id` text,
	`idempotency_key` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`option_id`) REFERENCES `turn_options`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turn_actions_journey_idempotency_unique` ON `turn_actions` (`journey_id`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `turn_options` (
	`id` text PRIMARY KEY NOT NULL,
	`turn_id` text NOT NULL,
	`position` integer NOT NULL,
	`question` text NOT NULL,
	`angle` text NOT NULL,
	`state` text DEFAULT 'proposed' NOT NULL,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turn_options_turn_position_unique` ON `turn_options` (`turn_id`,`position`);--> statement-breakpoint
CREATE TABLE `turn_sources` (
	`turn_id` text NOT NULL,
	`source_id` text NOT NULL,
	`relation` text NOT NULL,
	PRIMARY KEY(`turn_id`, `source_id`, `relation`),
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `turns` (
	`id` text PRIMARY KEY NOT NULL,
	`journey_id` text NOT NULL,
	`parent_turn_id` text,
	`question` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`answer` text,
	`transition` text,
	`topic_label` text,
	`provider` text,
	`model_id` text,
	`prompt_version` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`ready_at` integer,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`parent_turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `turns_journey_created_idx` ON `turns` (`journey_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `turns_parent_idx` ON `turns` (`parent_turn_id`);