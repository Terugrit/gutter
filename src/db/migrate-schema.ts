import type Database from "better-sqlite3";

export function migrateSchema(sqlite: Database.Database) {
  sqlite.transaction(() => {
    sqlite.exec(`CREATE TABLE IF NOT EXISTS followed_series (id INTEGER PRIMARY KEY AUTOINCREMENT, komga_series_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, publisher TEXT, metron_series_id INTEGER, comicvine_volume_id INTEGER, kapowarr_volume_id INTEGER, match_status TEXT NOT NULL DEFAULT 'unmatched', monitor_mode TEXT NOT NULL DEFAULT 'future_only', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))); CREATE TABLE IF NOT EXISTS issues (id INTEGER PRIMARY KEY AUTOINCREMENT, metron_issue_id INTEGER NOT NULL UNIQUE, followed_series_id INTEGER NOT NULL, number TEXT NOT NULL, title TEXT, store_date TEXT, cover_url TEXT, description TEXT, credits_json TEXT, owned INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, type TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE, sent_at TEXT, ntfy_status TEXT, read_at TEXT, deleted_at TEXT); CREATE TABLE IF NOT EXISTS kv_cache (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, fetched_at TEXT NOT NULL, ttl_seconds INTEGER NOT NULL);`);
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
    addColumn("notifications", "deleted_at", "TEXT");
    sqlite.exec(`CREATE TABLE IF NOT EXISTS reading_shelf (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metron_series_id INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      publisher TEXT NOT NULL,
      year_began INTEGER,
      cover_url TEXT,
      saved_at TEXT NOT NULL
    );`);
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS upcoming_releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metron_issue_id INTEGER UNIQUE,
        comicvine_issue_id INTEGER,
        metron_series_id INTEGER,
        comicvine_series_id INTEGER,
        series_name TEXT NOT NULL,
        issue_number TEXT NOT NULL,
        publisher TEXT NOT NULL,
        genres_json TEXT NOT NULL DEFAULT '[]',
        cover_url TEXT,
        expected_release_date TEXT NOT NULL,
        release_confidence TEXT NOT NULL DEFAULT 'solicited',
        is_wildcard INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL,
        last_refreshed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS dismissed_series (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        series_key TEXT NOT NULL UNIQUE,
        metron_series_id INTEGER,
        comicvine_series_id INTEGER,
        series_name TEXT NOT NULL,
        dismissed_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS interest_filters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'exclude'
      );
      CREATE UNIQUE INDEX IF NOT EXISTS interest_filters_kind_value_unique ON interest_filters (kind, value);
      CREATE TABLE IF NOT EXISTS interest_weights (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        value TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 100
      );
      CREATE UNIQUE INDEX IF NOT EXISTS interest_weights_kind_value_unique ON interest_weights (kind, value);
      CREATE TABLE IF NOT EXISTS watches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        upcoming_release_id INTEGER NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'watching',
        scope TEXT NOT NULL,
        outcome TEXT DEFAULT 'pending',
        created_at TEXT NOT NULL,
        notified_at TEXT
      );
      CREATE TABLE IF NOT EXISTS release_shelf (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        watch_id INTEGER UNIQUE,
        series_name TEXT NOT NULL,
        issue_number TEXT NOT NULL,
        cover_url TEXT,
        kapowarr_link TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        added_at TEXT NOT NULL,
        removed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS upcoming_releases_date_idx ON upcoming_releases (expected_release_date);
      CREATE INDEX IF NOT EXISTS upcoming_releases_metron_series_idx ON upcoming_releases (metron_series_id);
      CREATE INDEX IF NOT EXISTS watches_status_outcome_idx ON watches (status, outcome);
      CREATE INDEX IF NOT EXISTS release_shelf_removed_at_idx ON release_shelf (removed_at);
    `);
    // These cover the predicates used by issue lists, release checks, and notification reads.
    // Keep them here so existing installations receive the same upgrades as new databases.
    sqlite.exec(`
      CREATE INDEX IF NOT EXISTS issues_followed_series_active_idx ON issues (followed_series_id, active);
      CREATE INDEX IF NOT EXISTS issues_active_owned_store_date_idx ON issues (active, owned, store_date);
      CREATE INDEX IF NOT EXISTS notifications_issue_type_idx ON notifications (issue_id, type);
      CREATE INDEX IF NOT EXISTS notifications_type_read_at_idx ON notifications (type, read_at);
      CREATE INDEX IF NOT EXISTS notifications_type_deleted_at_idx ON notifications (type, deleted_at);
      CREATE INDEX IF NOT EXISTS followed_series_active_match_status_idx ON followed_series (active, match_status);
      CREATE INDEX IF NOT EXISTS followed_series_metron_series_idx ON followed_series (metron_series_id);
      CREATE INDEX IF NOT EXISTS followed_series_comicvine_volume_idx ON followed_series (comicvine_volume_id);
      CREATE INDEX IF NOT EXISTS upcoming_releases_comicvine_series_idx ON upcoming_releases (comicvine_series_id);
    `);
    const mockEntry = sqlite.prepare("SELECT 1 FROM kv_cache WHERE key LIKE 'mock:%' LIMIT 1").get();
    if (mockEntry) sqlite.prepare("DELETE FROM kv_cache WHERE key LIKE 'mock:%'").run();
  })();
}
