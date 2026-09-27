CREATE INDEX `followed_series_metron_series_idx` ON `followed_series` (`metron_series_id`);--> statement-breakpoint
CREATE INDEX `followed_series_comicvine_volume_idx` ON `followed_series` (`comicvine_volume_id`);--> statement-breakpoint
CREATE INDEX `issues_followed_series_active_idx` ON `issues` (`followed_series_id`,`active`);--> statement-breakpoint
CREATE INDEX `upcoming_releases_comicvine_series_idx` ON `upcoming_releases` (`comicvine_series_id`);