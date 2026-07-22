ALTER TABLE `research_requests` ADD `research_checkpoint_json` text;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `progress_phase` text;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `progress_message` text;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `progress_attempt` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `progress_max_attempts` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `progress_updated_at` integer;