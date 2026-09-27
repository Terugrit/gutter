CREATE TABLE `dismissed_series` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_key` text NOT NULL,
	`metron_series_id` integer,
	`comicvine_series_id` integer,
	`series_name` text NOT NULL,
	`dismissed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dismissed_series_series_key_unique` ON `dismissed_series` (`series_key`);--> statement-breakpoint
CREATE TABLE `interest_filters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`mode` text DEFAULT 'exclude' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interest_filters_kind_value_unique` ON `interest_filters` (`kind`,`value`);--> statement-breakpoint
CREATE TABLE `interest_weights` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`score` integer DEFAULT 100 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `interest_weights_kind_value_unique` ON `interest_weights` (`kind`,`value`);--> statement-breakpoint
CREATE TABLE `release_shelf` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`watch_id` integer,
	`series_name` text NOT NULL,
	`issue_number` text NOT NULL,
	`cover_url` text,
	`kapowarr_link` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`added_at` text NOT NULL,
	`removed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `release_shelf_watch_id_unique` ON `release_shelf` (`watch_id`);--> statement-breakpoint
CREATE TABLE `upcoming_releases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`metron_issue_id` integer,
	`comicvine_issue_id` integer,
	`metron_series_id` integer,
	`comicvine_series_id` integer,
	`series_name` text NOT NULL,
	`issue_number` text NOT NULL,
	`publisher` text NOT NULL,
	`genres_json` text DEFAULT '[]' NOT NULL,
	`cover_url` text,
	`expected_release_date` text NOT NULL,
	`release_confidence` text DEFAULT 'solicited' NOT NULL,
	`is_wildcard` integer DEFAULT false NOT NULL,
	`source` text NOT NULL,
	`last_refreshed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `upcoming_releases_metron_issue_id_unique` ON `upcoming_releases` (`metron_issue_id`);--> statement-breakpoint
CREATE TABLE `watches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`upcoming_release_id` integer NOT NULL,
	`status` text DEFAULT 'watching' NOT NULL,
	`scope` text NOT NULL,
	`outcome` text DEFAULT 'pending',
	`created_at` text NOT NULL,
	`notified_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `watches_upcoming_release_id_unique` ON `watches` (`upcoming_release_id`);