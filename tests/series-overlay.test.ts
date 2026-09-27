import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const directory = mkdtempSync(join(tmpdir(), "gutter-series-overlay-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");
process.env.TZ = "UTC";
process.env.COMICVINE_API_KEY = "comicvine-key";
const server = setupServer(http.get("https://comicvine.gamespot.com/api/search/", () => HttpResponse.json({ status_code: 1, error: "OK", results: [] })));
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let service: typeof import("@/lib/services/series-overlay");

beforeAll(async () => {
  server.listen({ onUnhandledRequest: "error" });
  database = await import("@/db");
  schema = await import("@/db/schema");
  service = await import("@/lib/services/series-overlay");
});
beforeEach(() => database.sqlite.exec("DELETE FROM upcoming_releases; DELETE FROM reading_shelf; DELETE FROM issues; DELETE FROM followed_series; DELETE FROM kv_cache;"));
afterEach(() => server.resetHandlers());
afterAll(() => { server.close(); database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

it("installs indexes for each external-ID and followed-issue lookup", () => {
  const names = ["followed_series", "issues", "upcoming_releases"].flatMap((table) => (database.sqlite.prepare(`PRAGMA index_list(${table})`).all() as { name: string }[]).map((row) => row.name));
  expect(names).toEqual(expect.arrayContaining(["followed_series_metron_series_idx", "followed_series_comicvine_volume_idx", "issues_followed_series_active_idx", "upcoming_releases_comicvine_series_idx"]));
});

it("uses a cached ComicVine detail as the sole description source", async () => {
  let detailCalls = 0;
  server.use(http.get("https://comicvine.gamespot.com/api/volume/4050-501/", () => {
    detailCalls += 1;
    return HttpResponse.json({ status_code: 1, error: "OK", results: { id: 501, name: "Night Signal", deck: "Short ComicVine deck.", description: "<p>A longer ComicVine description &amp; synopsis.</p>" } });
  }));
  const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "night-signal", title: "Night Signal", publisher: "Harbor", metronSeriesId: 77, matchStatus: "confirmed", seriesStatus: "ongoing" }).returning())[0];
  await database.db.insert(schema.issues).values([
    { metronIssueId: 7001, followedSeriesId: follow.id, number: "1", storeDate: "2026-01-01", owned: true, updatedAt: "2026-01-01T00:00:00Z" },
    { metronIssueId: 7002, followedSeriesId: follow.id, number: "2", storeDate: "2026-10-10", owned: false, coverUrl: "https://example.test/cover.jpg", updatedAt: "2026-01-01T00:00:00Z" },
  ]);
  await database.db.insert(schema.readingShelf).values({ metronSeriesId: 77, title: "Night Signal", publisher: "Harbor", yearBegan: 2024, savedAt: "2026-01-01T00:00:00Z" });
  await database.db.insert(schema.kvCache).values({ key: "metron:series:77", valueJson: JSON.stringify({ id: 77, series: "Night Signal", year_began: 2024, issue_count: 12, publisher: { id: 1, name: "Harbor" }, cv_id: 501, status: "Ongoing", desc: "This Metron text must not be displayed.", genres: [{ name: "Mystery" }] }), fetchedAt: "2020-01-01T00:00:00Z", ttlSeconds: 1 });
  const detail = await service.getSeriesOverlayDetail("metron:77");
  const cachedDetail = await service.getSeriesOverlayDetail("metron:77");
  expect(detail).toMatchObject({ title: "Night Signal", description: "A longer ComicVine description & synopsis.", year: 2024, status: "ongoing", ownedIssues: 1, totalIssues: 2, genres: ["Mystery"], nextReleaseDate: "2026-10-10", followed: true, onShelf: true, coverUrl: "https://example.test/cover.jpg" });
  expect(cachedDetail?.description).toBe("A longer ComicVine description & synopsis.");
  expect(detailCalls).toBe(1);
});

it("uses local recommendation data when an unfollowed series has no detailed cache", async () => {
  await database.db.insert(schema.kvCache).values({ key: "discover:recommendations", valueJson: JSON.stringify({ recommended: [{ id: 88, title: "Paper Moon", publisher: "Lamplight", yearBegan: 2025, coverUrl: "", reason: "Picked at random" }], different: [] }), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 });
  const detail = await service.getSeriesOverlayDetail("metron:88");
  expect(detail).toMatchObject({ title: "Paper Moon", publisher: "Lamplight", year: 2025, followed: false, onShelf: false, ownedIssues: 0 });
});
