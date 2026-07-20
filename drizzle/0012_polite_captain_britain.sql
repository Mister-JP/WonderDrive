CREATE TABLE `bookmarks` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text NOT NULL,
	`journey_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bookmarks_identity_turn_unique` ON `bookmarks` (`identity_id`,`turn_id`);--> statement-breakpoint
CREATE INDEX `bookmarks_identity_created_idx` ON `bookmarks` (`identity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `bookmarks_journey_idx` ON `bookmarks` (`journey_id`);