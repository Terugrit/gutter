import type Database from "better-sqlite3";

export function migrateSchema(sqlite: Database.Database) {
  sqlite.transaction(() => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS followed_series (id INTEGER PRIMARY KEY AUTOINCREMENT, komga_series_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, publisher TEXT, metron_series_id INTEGER, comicvine_volume_id INTEGER, kapowarr_volume_id INTEGER, match_status TEXT NOT NULL DEFAULT 'unmatched', monitor_mode TEXT NOT NULL DEFAULT 'future_only', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))); CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY AUTOINCREMENT, metron_issue_id INTEGER NOT NULL UNIQUE, followed_series_id INTEGER NOT NULL, number TEXT NOT NULL, title TEXT, store_date TEXT, cover_url TEXT, description TEXT, credits_json TEXT, owned INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, type TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE, sent_at TEXT, ntfy_status TEXT, read_at TEXT); CREATE TABLE IF NOT EXISTS kv_cache (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, fetched_at TEXT NOT NULL, ttl_seconds INTEGER NOT NULL);`);
    function addColumn(table: string, column: string, definition: string) {
      const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
      if (!columns.some((item) => item.name === column)) sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    addColumn("followed_series", "publisher", "TEXT");
    addColumn("followed_series", "active", "INTEGER NOT NULL DEFAULT 1");
    addColumn("issues", "owned", "INTEGER NOT NULL DEFAULT 0");
    addColumn("issues", "active", "INTEGER NOT NULL DEFAULT 1");
    addColumn("issues", "skipped_at", "INTEGER");
    addColumn("issues", "previous_date", "TEXT");
    addColumn("issues", "date_changed_at", "INTEGER");
    addColumn("followed_series", "series_status", "TEXT");
    const mockEntry = sqlite.prepare("SELECT 1 FROM kv_cache WHERE key LIKE 'mock:%' LIMIT 1").get();
    if (mockEntry) sqlite.prepare("DELETE FROM kv_cache WHERE key LIKE 'mock:%'").run();
  })();
}
