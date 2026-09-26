import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const followedSeries = sqliteTable("followed_series", {
  seriesStatus: text("series_status"),
  id: integer("id").primaryKey({ autoIncrement: true }), komgaSeriesId: text("komga_series_id").notNull().unique(), title: text("title").notNull(), publisher: text("publisher"),
  metronSeriesId: integer("metron_series_id"), comicvineVolumeId: integer("comicvine_volume_id"), kapowarrVolumeId: integer("kapowarr_volume_id"),
  matchStatus: text("match_status", { enum: ["auto", "confirmed", "unmatched"] }).notNull().default("unmatched"), monitorMode: text("monitor_mode", { enum: ["future_only", "all"] }).notNull().default("future_only"), active: integer("active", { mode: "boolean" }).notNull().default(true), createdAt: text("created_at").notNull().default("(strftime('%Y-%m-%dT%H:%M:%fZ','now'))")
});
export const issues = sqliteTable("issues", { skippedAt: integer("skipped_at"), previousDate: text("previous_date"), dateChangedAt: integer("date_changed_at"), id: integer("id").primaryKey({ autoIncrement: true }), metronIssueId: integer("metron_issue_id").notNull().unique(), followedSeriesId: integer("followed_series_id").notNull(), number: text("number").notNull(), title: text("title"), storeDate: text("store_date"), coverUrl: text("cover_url"), description: text("description"), creditsJson: text("credits_json"), owned: integer("owned", { mode: "boolean" }).notNull().default(false), active: integer("active", { mode: "boolean" }).notNull().default(true), updatedAt: text("updated_at").notNull() });
export const notifications = sqliteTable("notifications", { id: integer("id").primaryKey({ autoIncrement: true }), issueId: integer("issue_id").notNull(), type: text("type", { enum: ["new_release", "weekly_digest"] }).notNull(), dedupeKey: text("dedupe_key").notNull().unique(), sentAt: text("sent_at"), ntfyStatus: text("ntfy_status"), readAt: text("read_at") });
export const kvCache = sqliteTable("kv_cache", { key: text("key").primaryKey(), valueJson: text("value_json").notNull(), fetchedAt: text("fetched_at").notNull(), ttlSeconds: integer("ttl_seconds").notNull() });
