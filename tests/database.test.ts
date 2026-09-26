import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { eq } from "drizzle-orm";

const directory = mkdtempSync(join(tmpdir(), "gutter-db-test-"));
const path = join(directory, "app.db");
const legacy = new Database(path);
legacy.exec("CREATE TABLE followed_series (id INTEGER PRIMARY KEY AUTOINCREMENT, komga_series_id TEXT NOT NULL UNIQUE, title TEXT NOT NULL, metron_series_id INTEGER, comicvine_volume_id INTEGER, kapowarr_volume_id INTEGER, match_status TEXT NOT NULL DEFAULT 'confirmed', monitor_mode TEXT NOT NULL DEFAULT 'future_only', created_at TEXT NOT NULL); CREATE TABLE issues (id INTEGER PRIMARY KEY AUTOINCREMENT, metron_issue_id INTEGER NOT NULL UNIQUE, followed_series_id INTEGER NOT NULL, number TEXT NOT NULL, title TEXT, store_date TEXT, cover_url TEXT, description TEXT, credits_json TEXT, updated_at TEXT NOT NULL);");
legacy.close();
process.env.GUTTER_DB_PATH = path;
process.env.NTFY_URL = "https://ntfy.example.test";
process.env.NTFY_TOPIC = "gutter";
process.env.APP_BASE_URL = "https://gutter.example.test";
process.env.METRON_USER = "test-user";
process.env.METRON_PASSWORD = "test-password";
process.env.KAPOWARR_URL = "http://kapowarr:5656";
process.env.KAPOWARR_API_KEY = "test-key";
const server = setupServer();
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let series: typeof import("@/lib/services/series");
let library: typeof import("@/lib/services/library");
let recommendations: typeof import("@/lib/services/recommendations");
let release: typeof import("@/jobs/refresh-releases");
let missing: typeof import("@/lib/services/missing");
let jobs: typeof import("@/jobs/status");

beforeAll(async () => {
  database = await import("@/db"); schema = await import("@/db/schema");
  series = await import("@/lib/services/series"); library = await import("@/lib/services/library"); recommendations = await import("@/lib/services/recommendations"); release = await import("@/jobs/refresh-releases");
  missing = await import("@/lib/services/missing");
  jobs = await import("@/jobs/status");
  server.listen();
});
afterAll(() => { server.close(); database?.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

describe("database-backed workflows", () => {
  it("upgrades legacy tables", () => {
    const columns = database.sqlite.prepare("PRAGMA table_info(followed_series)").all() as { name: string }[];
    expect(columns.map((item) => item.name)).toContain("active");
    expect(columns.map((item) => item.name)).toContain("publisher");
    expect(columns.map((item) => item.name)).toContain("series_status");
    expect((database.sqlite.prepare("PRAGMA table_info(issues)").all() as { name: string }[]).map((item) => item.name)).toContain("skipped_at");
    expect((database.sqlite.prepare("PRAGMA table_info(issues)").all() as { name: string }[]).map((item) => item.name)).toContain("owned");
    expect((database.sqlite.prepare("PRAGMA table_info(issues)").all() as { name: string }[]).map((item) => item.name)).toContain("active");
  });
  it("applies ownership and preserves notification history on unfollow", async () => {
    const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "komga-1", title: "Night Signal", publisher: "Harbor", matchStatus: "confirmed", monitorMode: "all", createdAt: "2026-01-01T00:00:00Z" }).returning())[0];
    const issue = (await database.db.insert(schema.issues).values({ metronIssueId: 111, followedSeriesId: follow.id, number: "1", title: "First", storeDate: "2026-09-01", updatedAt: new Date().toISOString() }).returning())[0];
    await database.db.insert(schema.kvCache).values({ key: "komga:books", valueJson: JSON.stringify([{ seriesId: "komga-1", metadata: { number: "1" } }]), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 });
    await library.applyKomgaOwnership();
    expect((await database.db.select().from(schema.issues).where(eq(schema.issues.id, issue.id)))[0].owned).toBe(true);
    await database.db.insert(schema.notifications).values({ issueId: issue.id, type: "new_release", dedupeKey: `new-release:${issue.id}`, sentAt: new Date().toISOString(), ntfyStatus: "sent" });
    expect(await series.unfollowSeries("komga-1")).toBe(true);
    expect(await series.getSeriesDetail("komga-1")).toBeNull();
    expect((await database.db.select().from(schema.notifications)).length).toBe(1);
    expect((await database.db.select().from(schema.issues).where(eq(schema.issues.id, issue.id)))[0].id).toBe(issue.id);
  });
  it("filters followed and dismissed recommendations after reload", async () => {
    await database.db.insert(schema.kvCache).values({ key: "discover:recommendations", valueJson: JSON.stringify({ recommended: [{ id: 10, title: "Alpha", publisher: "P", reason: "Same publisher", coverUrl: "" }, { id: 11, title: "Beta", publisher: "P", reason: "Same writer", coverUrl: "" }], different: [] }), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 });
    await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "discover:10", title: "Alpha", metronSeriesId: 10, matchStatus: "confirmed" });
    await recommendations.dismissRecommendation(11);
    expect(await recommendations.getRecommendations()).toEqual({ recommended: [], different: [] });
  });
  it("reconciles a Discover follow when that title appears in Komga", async () => {
    await library.reconcileDiscoverFollows([{ id: "komga-alpha", t: "Alpha", pub: "P" }]);
    const reconciled = (await database.db.select().from(schema.followedSeries).where(eq(schema.followedSeries.komgaSeriesId, "komga-alpha")))[0];
    expect(reconciled.active).toBe(true);
    expect(reconciled.metronSeriesId).toBe(10);
  });
  it("respects future-only monitoring and excludes old or archived issues", async () => {
    const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "komga-monitor", title: "Monitor", matchStatus: "confirmed", createdAt: "2026-09-10T14:00:00Z" }).returning())[0];
    for (const [id, date, active] of [[301, "2026-09-09", true], [302, "2026-09-10", true], [303, "2026-09-11", false]] as const) await database.db.insert(schema.issues).values({ metronIssueId: id, followedSeriesId: follow.id, number: String(id), storeDate: date, active, updatedAt: new Date().toISOString() });
    expect((await missing.getMissingIssues()).filter((item) => item.s === "Monitor").map((item) => item.i)).toEqual(["302"]);
    await database.db.update(schema.followedSeries).set({ monitorMode: "all" }).where(eq(schema.followedSeries.id, follow.id));
    expect((await missing.getMissingIssues()).filter((item) => item.s === "Monitor").map((item) => item.i)).toEqual(["301", "302"]);
  });
  it("retries failed delivery and sends an issue only once after success", async () => {
    const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "komga-2", title: "The Salt Line", matchStatus: "confirmed" }).returning())[0];
    const issue = (await database.db.insert(schema.issues).values({ metronIssueId: 222, followedSeriesId: follow.id, number: "2", storeDate: "2026-09-20", updatedAt: new Date().toISOString() }).returning())[0];
    let calls = 0;
    server.use(http.post("https://ntfy.example.test/gutter", () => { calls += 1; return calls === 1 ? new HttpResponse("failed", { status: 500 }) : HttpResponse.json({ id: "sent" }); }));
    const row = { issueId: issue.id, seriesTitle: follow.title, number: "2", issueTitle: null, storeDate: "2026-09-20", coverUrl: null };
    expect(await release.sendRelease(row)).toBe(false);
    expect(await release.sendRelease(row)).toBe(true);
    expect(await release.sendRelease(row)).toBe(false);
    expect(calls).toBe(2);
  });
  it("serializes different jobs and rejects an overlapping copy", async () => {
    const events: string[] = [];
    const first = jobs.runTrackedJob("sync-komga", async () => { events.push("sync start"); await new Promise((resolve) => setTimeout(resolve, 20)); events.push("sync end"); return 1; });
    const duplicate = jobs.runTrackedJob("sync-komga", async () => { events.push("duplicate"); return 2; });
    const second = jobs.runTrackedJob("refresh-releases", async () => { events.push("release start"); return 3; });
    expect(await Promise.all([first, duplicate, second])).toEqual([1, null, 3]);
    expect(events).toEqual(["sync start", "sync end", "release start"]);
  });
  it("keeps records readable from a new SQLite connection", () => {
    const reopened = new Database(path, { readonly: true });
    const row = reopened.prepare("SELECT COUNT(*) AS total FROM notifications").get() as { total: number };
    expect(row.total).toBeGreaterThan(0);
    reopened.close();
  });
  it("rotates Something different from the persisted pool without searching Metron", async () => {
    await database.db.insert(schema.kvCache).values({ key: "komga:series", valueJson: "[]", fetchedAt: new Date().toISOString(), ttlSeconds: 3600 }).onConflictDoUpdate({ target: schema.kvCache.key, set: { valueJson: "[]" } });
    const previous = { recommended: [{ id: 900, title: "Kept recommendation", publisher: "P", reason: "Same publisher", coverUrl: "https://example.test/cover.jpg" }], different: [{ id: 901, title: "Old random", publisher: "P", reason: "Picked at random", coverUrl: "https://example.test/cover.jpg" }] };
    await database.db.insert(schema.kvCache).values({ key: "discover:recommendations", valueJson: JSON.stringify(previous), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 }).onConflictDoUpdate({ target: schema.kvCache.key, set: { valueJson: JSON.stringify(previous) } });
    await database.db.insert(schema.kvCache).values({ key: "discover:recommended-day", valueJson: JSON.stringify({ day: new Date().toISOString().slice(0, 10), sequence: 0 }), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 }).onConflictDoUpdate({ target: schema.kvCache.key, set: { valueJson: JSON.stringify({ day: new Date().toISOString().slice(0, 10), sequence: 0 }) } });
    const pool = { entries: Array.from({ length: 30 }, (_, index) => ({ id: index + 1000, title: `Random ${index}`, publisher: `Publisher ${Math.floor(index / 2)}`, checked: true, coverUrl: "https://example.test/issue.jpg" })), shownIds: [] };
    await database.db.insert(schema.kvCache).values({ key: "discover:pool", valueJson: JSON.stringify(pool), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 }).onConflictDoUpdate({ target: schema.kvCache.key, set: { valueJson: JSON.stringify(pool) } });
    let searches = 0;
    let previews = 0;
    server.use(
      http.get("https://metron.cloud/api/series/", () => { searches += 1; return HttpResponse.json({ count: 0, next: null, results: [] }); }),
      http.get("https://metron.cloud/api/series/:id/issue_list/", () => { previews += 1; return HttpResponse.json({ count: 0, next: null, results: [] }); }),
    );
    const first = await recommendations.refreshDiscover("different");
    const second = await recommendations.refreshDiscover("different");
    expect(first.recommended.map((item) => item.id)).toEqual([900]);
    expect(first.different).toHaveLength(10);
    expect(second.different).toHaveLength(10);
    expect(Math.max(...[...new Set(first.different.map((item) => item.publisher))].map((publisher) => first.different.filter((item) => item.publisher === publisher).length))).toBeLessThanOrEqual(2);
    expect(first.different.every((item) => item.id !== 900)).toBe(true);
    expect(second.different.some((item) => !first.different.some((prior) => prior.id === item.id))).toBe(true);
    expect(searches).toBe(0);
    expect(previews).toBe(0);
  });
  it("refills a thin pool with at most five series pages and ten issue previews", async () => {
    await database.db.insert(schema.kvCache).values({ key: "discover:pool", valueJson: JSON.stringify({ entries: [], shownIds: [] }), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 }).onConflictDoUpdate({ target: schema.kvCache.key, set: { valueJson: JSON.stringify({ entries: [], shownIds: [] }) } });
    const pages: number[] = [];
    let previews = 0;
    server.use(
      http.get("https://metron.cloud/api/series/", ({ request }) => {
        const url = new URL(request.url);
        expect(url.searchParams.get("language")).toBe("en");
        expect(url.searchParams.get("name")).toBeNull();
        const page = Number(url.searchParams.get("page"));
        pages.push(page);
        return HttpResponse.json({ count: 60, next: `https://metron.cloud/api/series/?page=${page + 1}`, results: Array.from({ length: 10 }, (_, index) => ({ id: page * 100 + index, series: `Sample ${page}-${index}`, publisher: { id: index, name: `House ${index}` }, language: "en" })) });
      }),
      http.get("https://metron.cloud/api/series/:id/issue_list/", ({ params }) => {
        previews += 1;
        return HttpResponse.json({ count: 1, next: "https://metron.cloud/api/series/1/issue_list/?page=2", results: [{ id: Number(params.id) + 10000, number: "1", image: "https://example.test/issue.jpg" }] });
      }),
    );
    const result = await recommendations.refreshDiscover("different");
    expect(result.different).toHaveLength(10);
    expect(pages).toHaveLength(5);
    expect(new Set(pages).size).toBe(5);
    expect(previews).toBeLessThanOrEqual(10);
    const saved = database.sqlite.prepare("SELECT value_json FROM kv_cache WHERE key='discover:pool'").get() as { value_json: string };
    expect(JSON.parse(saved.value_json).entries.length).toBeGreaterThan(10);
  });
  it("keeps covered picks on page loads and prepares the next covered set only on refresh", async () => {
    await database.db.update(schema.followedSeries).set({ active: false });
    const put = async (key: string, value: unknown) => database.db.insert(schema.kvCache).values({ key, valueJson: JSON.stringify(value), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 }).onConflictDoUpdate({ target: schema.kvCache.key, set: { valueJson: JSON.stringify(value) } });
    await put("komga:series", Array.from({ length: 5 }, (_, index) => ({ id: `seed-${index}`, t: `Seed ${index}`, pub: `House ${index}` })));
    await put("komga:books", Array.from({ length: 5 }, (_, index) => ({ seriesId: `seed-${index}`, metadata: { releaseDate: "2020-01-01" } })));
    await put("discover:pool", { entries: Array.from({ length: 100 }, (_, index) => ({ id: index + 1000, title: `${index < 50 ? "A" : "Z"} Series ${index}`, publisher: `House ${index % 5}`, yearBegan: 2020, issueCount: 1, checked: false, coverUrl: null })), shownIds: [] });
    await put("discover:recommendations", { recommended: [{ id: 9999, title: "Previous pick", publisher: "House 0", reason: "Same publisher as Seed 0", coverUrl: "https://example.test/old.jpg" }], different: [{ id: 1000, title: "A Series 0", publisher: "House 0", reason: "Picked at random", coverUrl: "" }] });
    await database.db.delete(schema.kvCache).where(eq(schema.kvCache.key, "discover:recommended-day"));
    await database.db.delete(schema.kvCache).where(eq(schema.kvCache.key, "discover:recommended-history"));
    let metronCalls = 0;
    server.use(http.get("https://metron.cloud/api/*", () => { metronCalls += 1; return HttpResponse.json({ count: 0, next: null, results: [] }); }));
    const first = await recommendations.getRecommendations();
    const second = await recommendations.getRecommendations();
    expect(first.recommended.map((item) => item.coverUrl)).toEqual(["https://example.test/old.jpg"]);
    expect(second.recommended).toEqual(first.recommended);
    expect(metronCalls).toBe(0);
    expect(database.sqlite.prepare("SELECT key FROM kv_cache WHERE key='discover:recommended-day'").get()).toBeUndefined();
    server.use(http.get("https://metron.cloud/api/series/:id/issue_list/", () => HttpResponse.json({ count: 0, next: null, results: [] })));
    const unavailable = await recommendations.refreshDiscover("recommended");
    expect(unavailable.recommended.map((item) => item.coverUrl)).toEqual(["https://example.test/old.jpg"]);
    expect(database.sqlite.prepare("SELECT key FROM kv_cache WHERE key='discover:recommended-day'").get()).toBeUndefined();
    database.sqlite.prepare("DELETE FROM kv_cache WHERE key LIKE 'metron:issue-preview:%'").run(); // simulate expiry before a later retry
    let previews = 0;
    server.use(http.get("https://metron.cloud/api/series/:id/issue_list/", ({ params }) => {
      previews += 1;
      return HttpResponse.json({ count: 1, next: null, results: [{ id: Number(params.id) + 10000, number: "1", image: `https://example.test/covers/${params.id}.jpg` }] });
    }));
    const refreshed = await recommendations.refreshDiscover("recommended");
    expect(refreshed.recommended).toHaveLength(10);
    expect(refreshed.recommended.every((item) => item.coverUrl.startsWith("https://example.test/covers/"))).toBe(true);
    expect(previews).toBeLessThanOrEqual(10);
    const history = database.sqlite.prepare("SELECT value_json FROM kv_cache WHERE key='discover:recommended-history'").get() as { value_json: string };
    for (const item of refreshed.recommended) expect(JSON.parse(history.value_json)[item.id].last_shown_at).toBeTruthy();
    const savedPool = database.sqlite.prepare("SELECT value_json FROM kv_cache WHERE key='discover:pool'").get() as { value_json: string };
    expect(JSON.parse(savedPool.value_json).entries.filter((item: { coverUrl: string | null }) => item.coverUrl).length).toBeGreaterThanOrEqual(10);
  }, 15_000);
  it("sends a discovered volume to Kapowarr using Metron's ComicVine ID", async () => {
    const picked = (await recommendations.getRecommendations()).recommended[0];
    expect(picked).toBeTruthy();
    let added = 0;
    let searches = 0;
    let comicVineLookups = 0;
    server.use(
      http.get("https://metron.cloud/api/series/:id/", ({ params }) => HttpResponse.json({ id: Number(params.id), series: picked.title, publisher: { id: 1, name: picked.publisher }, cv_id: 424242, language: "en" })),
      http.get("https://metron.cloud/api/series/:id/issue_list/", () => HttpResponse.json({ count: 0, next: null, results: [] })),
      http.get("https://comicvine.gamespot.com/api/search/", () => { comicVineLookups += 1; return HttpResponse.json({ status_code: 1, error: "OK", results: [] }); }),
      http.get("http://kapowarr:5656/api/volumes", () => HttpResponse.json({ error: null, result: added ? [{ id: 9, comicvine_id: 424242 }] : [] })),
      http.get("http://kapowarr:5656/api/rootfolder", () => HttpResponse.json({ error: null, result: [{ id: 3 }] })),
      http.post("http://kapowarr:5656/api/volumes", async ({ request }) => {
        const body = await request.json() as { comicvine_id: number; auto_search: boolean };
        expect(body.comicvine_id).toBe(424242);
        expect(body.auto_search).toBe(false);
        added += 1;
        return HttpResponse.json({ error: null, result: { id: 9, comicvine_id: 424242 } }, { status: 201 });
      }),
      http.post("http://kapowarr:5656/api/system/tasks", async ({ request }) => {
        expect(await request.json()).toEqual({ cmd: "auto_search", volume_id: 9 });
        searches += 1;
        return HttpResponse.json({ error: null, result: {} }, { status: 201 });
      }),
    );
    const { POST } = await import("@/app/api/discover/[id]/kapowarr/route");
    const args = { params: Promise.resolve({ id: String(picked.id) }) };
    const first = await POST(new Request("https://gutter.example.test/api/discover/volume/kapowarr", { method: "POST" }), args);
    expect(first.status).toBe(200);
    const second = await POST(new Request("https://gutter.example.test/api/discover/volume/kapowarr", { method: "POST" }), args);
    expect(second.status).toBe(200);
    const follow = (await database.db.select().from(schema.followedSeries).where(eq(schema.followedSeries.metronSeriesId, picked.id)))[0];
    expect(follow.comicvineVolumeId).toBe(424242);
    expect(follow.kapowarrVolumeId).toBe(9);
    expect(added).toBe(1);
    expect(searches).toBe(1);
    expect(comicVineLookups).toBe(0);
  });
});
