CREATE TABLE `reading_shelf` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metron_series_id` integer NOT NULL,
	`title` text NOT NULL,
	`publisher` text NOT NULL,
	`year_began` integer,
	`cover_url` text,
	`saved_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reading_shelf_metron_series_id_unique` ON `reading_shelf` (`metron_series_id`);