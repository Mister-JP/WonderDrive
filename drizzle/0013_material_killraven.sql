DROP INDEX `research_requests_identity_active_unique`;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `execution_mode` text DEFAULT 'foreground' NOT NULL;--> statement-breakpoint
ALTER TABLE `research_requests` ADD `cost_reservation_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `research_requests_identity_active_unique` ON `research_requests` (`identity_id`) WHERE "research_requests"."execution_mode" = 'foreground' AND "research_requests"."status" IN ('reserved', 'researching');