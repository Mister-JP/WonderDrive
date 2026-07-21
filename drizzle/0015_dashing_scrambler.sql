PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_preferences` (
	`identity_id` text PRIMARY KEY NOT NULL,
	`interface_locale` text DEFAULT 'en' NOT NULL,
	`default_output_locale` text DEFAULT 'en' NOT NULL,
	`default_model_id` text DEFAULT 'gpt-5.4-nano' NOT NULL,
	`answer_density` text DEFAULT 'balanced' NOT NULL,
	`text_size` text DEFAULT 'm' NOT NULL,
	`image_preference` text DEFAULT 'when-useful' NOT NULL,
	`reduce_motion` integer DEFAULT false NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_preferences`("identity_id", "interface_locale", "default_output_locale", "default_model_id", "answer_density", "text_size", "image_preference", "reduce_motion", "updated_at") SELECT "identity_id", "interface_locale", "default_output_locale", "default_model_id", "answer_density", "text_size", "image_preference", "reduce_motion", "updated_at" FROM `preferences`;--> statement-breakpoint
DROP TABLE `preferences`;--> statement-breakpoint
ALTER TABLE `__new_preferences` RENAME TO `preferences`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
