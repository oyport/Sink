CREATE TABLE `guest_link_usage` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`link_id` text NOT NULL,
	`ip_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`status` text NOT NULL,
	`reservation_expires_at` integer
);
--> statement-breakpoint
CREATE INDEX `guest_link_usage_ip_created_at_idx` ON `guest_link_usage` (`ip_hash`,`created_at`);--> statement-breakpoint
CREATE INDEX `guest_link_usage_created_at_idx` ON `guest_link_usage` (`created_at`);--> statement-breakpoint
CREATE INDEX `guest_link_usage_status_reservation_expires_at_idx` ON `guest_link_usage` (`status`,`reservation_expires_at`);--> statement-breakpoint
CREATE INDEX `guest_link_usage_slug_idx` ON `guest_link_usage` (`slug`);