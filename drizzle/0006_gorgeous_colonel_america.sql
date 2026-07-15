CREATE TABLE `provider_usage_events` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text,
	`journey_id` text,
	`turn_id` text,
	`research_request_id` text,
	`provider` text NOT NULL,
	`model_id` text NOT NULL,
	`operation` text NOT NULL,
	`purpose` text NOT NULL,
	`outcome` text NOT NULL,
	`provider_response_id` text,
	`provider_request_id` text,
	`http_status` integer,
	`input_tokens` integer DEFAULT 0 NOT NULL,
	`cached_input_tokens` integer DEFAULT 0 NOT NULL,
	`output_tokens` integer DEFAULT 0 NOT NULL,
	`reasoning_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`web_search_calls` integer DEFAULT 0 NOT NULL,
	`page_fetches` integer DEFAULT 0 NOT NULL,
	`estimated_cost_microusd` integer DEFAULT 0 NOT NULL,
	`rate_effective_at` text NOT NULL,
	`latency_ms` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`error_message` text,
	`metadata_json` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`identity_id`) REFERENCES `identities`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`journey_id`) REFERENCES `journeys`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`turn_id`) REFERENCES `turns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`research_request_id`) REFERENCES `research_requests`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `provider_usage_identity_created_idx` ON `provider_usage_events` (`identity_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `provider_usage_operation_created_idx` ON `provider_usage_events` (`operation`,`created_at`);--> statement-breakpoint
CREATE INDEX `provider_usage_request_idx` ON `provider_usage_events` (`research_request_id`);