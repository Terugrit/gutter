import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const followedSeries = sqliteTable("followed_series", {
  seriesStatus: text("series_status"),
  id: integer("id").primaryKey({ autoIncrement: true }), komgaSeriesId: text("komga_series_id").notNull().unique(), title: text("title").notNull(), publisher: text("publisher"),
  metronSeriesId: integer("metron_series_id"), comicvineVolumeId: integer("comicvine_volume_id"), kapowarrVolumeId: integer("kapowarr_volume_id"),
  matchStatus: text("match_status", { enum: ["auto", "confirmed", "unmatched"] }).notNull().default("unmatched"), monitorMode: text("monitor_mode", { enum: ["future_only", "all"] }).notNull().default("future_only"), active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull().default("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
});
export const issues = sqliteTable("issues", { skippedAt: integer("skipped_at"), previousDate: text("previous_date"), dateChangedAt: integer("date_changed_at"), id: integer("id").primaryKey({ autoIncrement: true }), metronIssueId: integer("metron_issue_id").notNull().unique(), followedSeriesId: integer("followed_series_id").notNull(), number: text("number").notNull(), title: text("title"), storeDate: text("store_date"), coverUrl: text("cover_url"), description: text("description"), creditsJson: text("credits_json"), owned: integer("owned", { mode: "boolean" }).notNull().default(false), active: integer("active", { mode: "boolean" }).notNull().default(true), updatedAt: text("updated_at").notNull() });
export const notifications = sqliteTable("notifications", { id: integer("id").primaryKey({ autoIncrement: true }), issueId: integer("issue_id").notNull(), type: text("type", { enum: ["new_release", "weekly_digest"] }).notNull(), dedupeKey: text("dedupe_key").notNull().unique(), sentAt: text("sent_at"), ntfyStatus: text("ntfy_status"), readAt: text("read_at"), deletedAt: text("deleted_at") });
export const kvCache = sqliteTable("kv_cache", { key: text("key").primaryKey(), valueJson: text("value_json").notNull(), fetchedAt: text("fetched_at").notNull(), ttlSeconds: integer("ttl_seconds").notNull() });
export const readingShelf = sqliteTable("reading_shelf", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metronSeriesId: integer("metron_series_id").notNull().unique(),
  title: text("title").notNull(),
  publisher: text("publisher").notNull(),
  yearBegan: integer("year_began"),
  coverUrl: text("cover_url"),
  savedAt: text("saved_at").notNull(),
});

export const upcomingReleases = sqliteTable("upcoming_releases", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  metronIssueId: integer("metron_issue_id").unique(),
  comicvineIssueId: integer("comicvine_issue_id"),
  metronSeriesId: integer("metron_series_id"),
  comicvineSeriesId: integer("comicvine_series_id"),
  seriesName: text("series_name").notNull(),
  issueNumber: text("issue_number").notNull(),
  publisher: text("publisher").notNull(),
  genresJson: text("genres_json").notNull().default("[]"),
  coverUrl: text("cover_url"),
  expectedReleaseDate: text("expected_release_date").notNull(),
  releaseConfidence: text("release_confidence", { enum: ["solicited", "confirmed"] }).notNull().default("solicited"),
  isWildcard: integer("is_wildcard", { mode: "boolean" }).notNull().default(false),
  source: text("source", { enum: ["metron", "comicvine", "manual"] }).notNull(),
  lastRefreshedAt: text("last_refreshed_at").notNull(),
}, (table) => [index("upcoming_releases_date_idx").on(table.expectedReleaseDate), index("upcoming_releases_metron_series_idx").on(table.metronSeriesId)]);

export const dismissedSeries = sqliteTable("dismissed_series", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  seriesKey: text("series_key").notNull().unique(),
  metronSeriesId: integer("metron_series_id"),
  comicvineSeriesId: integer("comicvine_series_id"),
  seriesName: text("series_name").notNull(),
  dismissedAt: text("dismissed_at").notNull(),
});

export const interestFilters = sqliteTable("interest_filters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["publisher", "genre"] }).notNull(),
  value: text("value").notNull(),
  mode: text("mode", { enum: ["exclude"] }).notNull().default("exclude"),
}, (table) => [uniqueIndex("interest_filters_kind_value_unique").on(table.kind, table.value)]);

export const interestWeights = sqliteTable("interest_weights", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["publisher", "genre"] }).notNull(),
  value: text("value").notNull(),
  score: integer("score").notNull().default(100),
}, (table) => [uniqueIndex("interest_weights_kind_value_unique").on(table.kind, table.value)]);

export const watches = sqliteTable("watches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  upcomingReleaseId: integer("upcoming_release_id").notNull().unique(),
  status: text("status", { enum: ["watching", "released", "notified"] }).notNull().default("watching"),
  scope: text("scope", { enum: ["issue", "series"] }).notNull(),
  outcome: text("outcome", { enum: ["pending", "downloaded", "expired"] }).default("pending"),
  createdAt: text("created_at").notNull(),
  notifiedAt: text("notified_at"),
}, (table) => [index("watches_status_outcome_idx").on(table.status, table.outcome)]);

export const releaseShelf = sqliteTable("release_shelf", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  watchId: integer("watch_id").unique(),
  seriesName: text("series_name").notNull(),
  issueNumber: text("issue_number").notNull(),
  coverUrl: text("cover_url"),
  kapowarrLink: text("kapowarr_link"),
  status: text("status", { enum: ["pending", "downloading", "downloaded"] }).notNull().default("pending"),
  addedAt: text("added_at").notNull(),
  removedAt: text("removed_at"),
}, (table) => [index("release_shelf_removed_at_idx").on(table.removedAt)]);
