CREATE INDEX `release_shelf_removed_at_idx` ON `release_shelf` (`removed_at`);--> statement-breakpoint
CREATE INDEX `upcoming_releases_date_idx` ON `upcoming_releases` (`expected_release_date`);--> statement-breakpoint
CREATE INDEX `upcoming_releases_metron_series_idx` ON `upcoming_releases` (`metron_series_id`);--> statement-breakpoint
CREATE INDEX `watches_status_outcome_idx` ON `watches` (`status`,`outcome`);