ALTER TABLE `provider_cost_reservations` ADD `absorbed_at` integer;--> statement-breakpoint
UPDATE `provider_cost_reservations`
SET `status` = 'absorbed',
    `settled_microusd` = COALESCE(`settled_microusd`, `reserved_microusd`),
    `absorbed_at` = CAST(unixepoch() * 1000 AS INTEGER)
WHERE `status` IN ('reserved', 'uncertain', 'settled')
  AND EXISTS (
    SELECT 1 FROM `research_requests`
    WHERE `research_requests`.`id` = `provider_cost_reservations`.`research_request_id`
      AND `research_requests`.`status` = 'failed'
  );
