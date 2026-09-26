import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE followed_series (
      series_status TEXT, id INTEGER PRIMARY KEY AUTOINCREMENT, komga_series_id TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL, publisher TEXT, metron_series_id INTEGER, comicvine_volume_id INTEGER,
      kapowarr_volume_id INTEGER, match_status TEXT NOT NULL DEFAULT 'unmatched',
      monitor_mode TEXT NOT NULL DEFAULT 'future_only', active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE issues (
      skipped_at INTEGER, previous_date TEXT, date_changed_at INTEGER, id INTEGER PRIMARY KEY AUTOINCREMENT,
      metron_issue_id INTEGER NOT NULL UNIQUE, followed_series_id INTEGER NOT NULL, number TEXT NOT NULL,
      title TEXT, store_date TEXT, cover_url TEXT, description TEXT, credits_json TEXT,
      owned INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL
    );
    CREATE TABLE kv_cache (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, fetched_at TEXT NOT NULL, ttl_seconds INTEGER NOT NULL);
  `);
  return { db: drizzle(sqlite), sqlite };
});
vi.mock("@/env", () => ({ env: {
  METRON_USER: "test", METRON_PASSWORD: "test", COMICVINE_API_KEY: "test", TZ: "UTC",
} }));

import { sqlite } from "@/db";
import { autoMatchFollowedSeries, cacheIssues, candidatesForSeries, confirmMatch } from "./metron";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); sqlite.close(); });
beforeEach(() => sqlite.exec("DELETE FROM issues; DELETE FROM followed_series; DELETE FROM kv_cache;"));

function seed(books: unknown[], title = "Local filename", publisher = "Local Press", metadata: Record<string, unknown> = {}) {
  sqlite.prepare("INSERT INTO followed_series (komga_series_id,title,publisher) VALUES (?,?,?)").run("local-series", title, publisher);
  const put = sqlite.prepare("INSERT INTO kv_cache (key,value_json,fetched_at,ttl_seconds) VALUES (?,?,?,3600)");
  put.run("komga:series", JSON.stringify([{ id: "local-series", t: title, pub: publisher, seed: 1, metadata }]), new Date().toISOString());
  put.run("komga:books", JSON.stringify(books), new Date().toISOString());
}
function expectMetronLookup(comicVineId: number | null, title = "Local filename", publisher = "Local Press") {
  let searches = 0;
  server.use(
    http.get("https://metron.cloud/api/series/", ({ request }) => {
      searches += 1;
      const query = new URL(request.url).searchParams;
      expect(query.get("language")).toBe("en");
      expect(query.get("cv_id")).toBe(comicVineId === null ? null : String(comicVineId));
      expect(query.get("name")).toBe(comicVineId === null ? title : null);
      expect(query.get("publisher_name")).toBe(comicVineId === null ? publisher : null);
      expect(query.get("year_began")).toBeNull();
      return HttpResponse.json({ count: 1, next: null, results: [{ id: 42, series: comicVineId === null ? title : "Metron's unrelated title", publisher: { id: 3, name: publisher }, year_began: 2005, cv_id: comicVineId ?? 10, language: "en" }] });
    }),
    http.get("https://metron.cloud/api/series/42/issue_list/", () => HttpResponse.json({ count: 0, next: null, results: [] })),
    http.get("https://metron.cloud/api/series/42/", () => HttpResponse.json({ id: 42, name: comicVineId === null ? title : "Metron's unrelated title", publisher: { id: 3, name: publisher }, cv_id: comicVineId ?? 10, language: "en" })),
  );
  return () => searches;
}
function savedFollow() {
  return sqlite.prepare("SELECT match_status, metron_series_id, comicvine_volume_id FROM followed_series WHERE komga_series_id='local-series'").get();
}

describe("ComicVine links embedded in Komga books", () => {
  it("uses a tagged 4050 volume directly even if the titles differ", async () => {
    seed([{ seriesId: "local-series", metadata: { links: [{ url: "https://comicvine.gamespot.com/some-volume/4050-10/" }] } }]);
    const searches = expectMetronLookup(10);
    let comicVineCalls = 0;
    server.use(http.get("https://comicvine.gamespot.com/api/*", () => { comicVineCalls += 1; return HttpResponse.error(); }));
    const match = await autoMatchFollowedSeries("local-series");
    expect(match).toMatchObject({ status: "auto", candidate: { id: 42, score: 100 } });
    expect(savedFollow()).toMatchObject({ match_status: "auto", metron_series_id: 42, comicvine_volume_id: 10 });
    expect(searches()).toBe(1);
    expect(comicVineCalls).toBe(0);
  });

  it("resolves a tagged 4000 issue to its parent volume before the Metron lookup", async () => {
    seed([{ seriesId: "local-series", metadata: { links: [{ url: "https://comicvine.gamespot.com/some-issue/4000-873262/" }] } }]);
    const searches = expectMetronLookup(10);
    let issueLookups = 0;
    server.use(http.get("https://comicvine.gamespot.com/api/issue/4000-873262/", ({ request }) => {
      issueLookups += 1;
      expect(new URL(request.url).searchParams.get("field_list")).toBe("volume");
      return HttpResponse.json({ status_code: 1, error: "OK", results: { id: 873262, volume: { id: 10 } } });
    }));
    const match = await autoMatchFollowedSeries("local-series");
    expect(match).toMatchObject({ status: "auto", candidate: { id: 42, score: 100 } });
    expect(savedFollow()).toMatchObject({ match_status: "auto", metron_series_id: 42, comicvine_volume_id: 10 });
    expect(searches()).toBe(1);
    expect(issueLookups).toBe(1);
  });

  it("falls back to fuzzy title and publisher matching without a link", async () => {
    seed([{ seriesId: "local-series", metadata: { links: [{ url: "https://example.test/not-comicvine" }] } }]);
    const searches = expectMetronLookup(null);
    let comicVineCalls = 0;
    server.use(http.get("https://comicvine.gamespot.com/api/*", () => { comicVineCalls += 1; return HttpResponse.error(); }));
    const match = await autoMatchFollowedSeries("local-series");
    expect(match).toMatchObject({ status: "auto", candidate: { id: 42, score: 90 } });
    expect(savedFollow()).toMatchObject({ match_status: "auto", metron_series_id: 42, comicvine_volume_id: 10 });
    expect(searches()).toBe(1);
    expect(comicVineCalls).toBe(0);
  });

  it("ignores an embedded link on a different Komga series", async () => {
    seed([{ seriesId: "someone-else", metadata: { links: [{ url: "https://comicvine.gamespot.com/other/4000-873262/" }] } }]);
    const searches = expectMetronLookup(null);
    let comicVineCalls = 0;
    server.use(http.get("https://comicvine.gamespot.com/api/*", () => { comicVineCalls += 1; return HttpResponse.error(); }));
    const match = await autoMatchFollowedSeries("local-series");
    expect(match).toMatchObject({ status: "auto", candidate: { id: 42, score: 90 } });
    expect(savedFollow()).toMatchObject({ match_status: "auto", metron_series_id: 42, comicvine_volume_id: 10 });
    expect(searches()).toBe(1);
    expect(comicVineCalls).toBe(0);
  });
});

describe("matching a Komga title with a parenthesized year", () => {
  it("searches the name without the year even when an explicit year is supplied for ranking", async () => {
    const searches = expectMetronLookup(null, "The Question", "DC");
    const candidates = await candidatesForSeries({ title: "The Question (2026)", publisher: "DC", year: 2026 });
    expect(candidates[0]).toMatchObject({ id: 42, score: 90 });
    expect(searches()).toBe(1);
  });

  it("auto-matches the title without filtering Metron by Komga's year", async () => {
    seed([], "The Question (2026)", "DC", { year: 2026 });
    const searches = expectMetronLookup(null, "The Question", "DC");
    const match = await autoMatchFollowedSeries("local-series");
    expect(match).toMatchObject({ status: "auto", candidate: { id: 42, score: 90 } });
    expect(savedFollow()).toMatchObject({ match_status: "auto", metron_series_id: 42 });
    expect(searches()).toBe(1);
  });
});

describe("manual match confirmation", () => {
  it("saves the selected ID and issue list without waiting for every issue detail", async () => {
    seed([{ seriesId: "local-series", metadata: { number: "1" } }], "Local filename");
    let details = 0;
    let searches = 0;
    server.use(
      http.get("https://metron.cloud/api/series/42/", () => HttpResponse.json({ id: 42, name: "A different Metron title", cv_id: 10, language: "en" })),
      http.get("https://metron.cloud/api/series/42/issue_list/", () => HttpResponse.json({ count: 2, next: null, results: [
        { id: 71, number: "1", issue: "First", store_date: null, image: null },
        { id: 72, number: "2", issue: "Second", store_date: null, image: null },
      ] })),
      http.get("https://metron.cloud/api/issue/:id/", ({ params }) => {
        details += 1;
        return HttpResponse.json({ id: Number(params.id), number: params.id === "71" ? "1" : "2", issue: "Detail", desc: "Full description", credits: [{ name: "A Writer", role: "Writer" }] });
      }),
      http.get("https://metron.cloud/api/series/", () => { searches += 1; return HttpResponse.json({ count: 0, next: null, results: [] }); }),
    );

    await expect(confirmMatch("local-series", 42)).resolves.toMatchObject({ id: 42 });
    expect(savedFollow()).toMatchObject({ match_status: "confirmed", metron_series_id: 42, comicvine_volume_id: 10 });
    expect(searches).toBe(0);
    expect(details).toBe(0);
    expect(sqlite.prepare("SELECT metron_issue_id,number,owned,description FROM issues ORDER BY metron_issue_id").all()).toEqual([
      { metron_issue_id: 71, number: "1", owned: 1, description: null },
      { metron_issue_id: 72, number: "2", owned: 0, description: null },
    ]);

    const follow = sqlite.prepare("SELECT id FROM followed_series WHERE komga_series_id='local-series'").get() as { id: number };
    await cacheIssues(follow.id, 42, true);
    expect(details).toBe(2);
    expect(sqlite.prepare("SELECT description FROM issues WHERE metron_issue_id=71").get()).toEqual({ description: "Full description" });
  });
});
