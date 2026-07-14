CREATE TABLE `starter_recommendations` (
	`identity_id` text PRIMARY KEY NOT NULL,
	`history_hash` text NOT NULL,
	`questions_json` text NOT NULL,
	`generated_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
