import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE followed_series (
      series_status TEXT,
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      komga_series_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      publisher TEXT,
      metron_series_id INTEGER,
      comicvine_volume_id INTEGER,
      kapowarr_volume_id INTEGER,
      match_status TEXT NOT NULL DEFAULT 'unmatched',
      monitor_mode TEXT NOT NULL DEFAULT 'future_only',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE issues (
      skipped_at INTEGER,
      previous_date TEXT,
      date_changed_at INTEGER,
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metron_issue_id INTEGER NOT NULL UNIQUE,
      followed_series_id INTEGER NOT NULL,
      number TEXT NOT NULL,
      title TEXT,
      store_date TEXT,
      cover_url TEXT,
      description TEXT,
      credits_json TEXT,
      owned INTEGER NOT NULL DEFAULT 0,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE,
      sent_at TEXT,
      ntfy_status TEXT,
      read_at TEXT,
      deleted_at TEXT
    );
  `);
  return { db: drizzle(sqlite), sqlite };
});

vi.mock("@/env", () => ({ env: {
  TZ: "UTC",
  NTFY_URL: undefined,
  NTFY_TOPIC: undefined,
  NTFY_TOKEN: undefined,
  APP_BASE_URL: undefined,
} }));

import { sqlite } from "@/db";
import { pendingReleases } from "./refresh-releases";

afterAll(() => sqlite.close());
beforeEach(() => sqlite.exec("DELETE FROM notifications; DELETE FROM issues; DELETE FROM followed_series;"));

function insertFollow(title = "Owned Series") {
  return Number(sqlite.prepare(`
    INSERT INTO followed_series (komga_series_id, title, match_status, monitor_mode, active, created_at)
    VALUES (?, ?, 'confirmed', 'all', 1, '2020-01-01T00:00:00.000Z')
  `).run(`komga-${title}`, title).lastInsertRowid);
}

function insertIssue(followedSeriesId: number, metronIssueId: number, number: string, owned: boolean) {
  sqlite.prepare(`
    INSERT INTO issues (metron_issue_id, followed_series_id, number, title, store_date, owned, active, updated_at)
    VALUES (?, ?, ?, ?, '2020-01-02', ?, 1, '2020-01-02T00:00:00.000Z')
  `).run(metronIssueId, followedSeriesId, number, `Issue ${number}`, owned ? 1 : 0);
}

describe("pendingReleases", () => {
  it("excludes an already-owned released issue that has not been notified", async () => {
    const followId = insertFollow();
    insertIssue(followId, 1, "1", true);

    await expect(pendingReleases()).resolves.toEqual([]);
  });

  it("includes an unowned released issue that has not been notified", async () => {
    const followId = insertFollow("Unowned Series");
    insertIssue(followId, 2, "7", false);

    await expect(pendingReleases()).resolves.toEqual([
      expect.objectContaining({ seriesTitle: "Unowned Series", number: "7" }),
    ]);
  });

  it("excludes an entire already-owned back-catalog", async () => {
    const followId = insertFollow("Back Catalog");
    for (let issue = 1; issue <= 20; issue += 1) {
      insertIssue(followId, 100 + issue, String(issue), true);
    }

    await expect(pendingReleases()).resolves.toEqual([]);
  });

  it("does not retry a notification the user deleted", async () => {
    const followId = insertFollow("Deleted notification");
    insertIssue(followId, 300, "8", false);
    const issue = sqlite.prepare("SELECT id FROM issues WHERE metron_issue_id = 300").get() as { id: number };
    sqlite.prepare("INSERT INTO notifications (issue_id, type, dedupe_key, deleted_at) VALUES (?, 'new_release', ?, ?)").run(issue.id, `new-release:${issue.id}`, "2026-09-27T12:00:00.000Z");

    await expect(pendingReleases()).resolves.toEqual([]);
  });
});
