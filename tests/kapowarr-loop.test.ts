import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const directory = mkdtempSync(join(tmpdir(), "gutter-m05-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");
process.env.KAPOWARR_URL = "http://kapowarr.test";
process.env.KAPOWARR_API_KEY = "key";
process.env.KOMGA_URL = "http://komga.test";
process.env.KOMGA_API_KEY = "key";
process.env.NTFY_URL = "http://ntfy.test";
process.env.NTFY_TOPIC = "comics";
process.env.APP_BASE_URL = "https://gutter.test";
process.env.ACTION_SECRET = "0123456789abcdefghijklmnopqrstuvwxyz";
const server = setupServer();
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let status: typeof import("@/lib/services/kapowarr-status");
let check: typeof import("@/jobs/check-kapowarr");
let tokens: typeof import("@/lib/action-token");
let markRoute: typeof import("@/app/api/actions/mark-read/route");
let sendRoute: typeof import("@/app/api/actions/send-kapowarr/route");
let sync: typeof import("@/jobs/sync-komga");
let scanRoute: typeof import("@/app/api/jobs/[name]/route");
beforeAll(async () => {
  database = await import("@/db"); schema = await import("@/db/schema");
  status = await import("@/lib/services/kapowarr-status"); check = await import("@/jobs/check-kapowarr");
  tokens = await import("@/lib/action-token"); markRoute = await import("@/app/api/actions/mark-read/route"); sendRoute = await import("@/app/api/actions/send-kapowarr/route");
  sync = await import("@/jobs/sync-komga");
  scanRoute = await import("@/app/api/jobs/[name]/route");
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => { database.sqlite.exec("DELETE FROM notifications; DELETE FROM issues; DELETE FROM followed_series; DELETE FROM kv_cache;"); server.resetHandlers(); });
afterAll(() => { server.close(); database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

async function fixture(volumeId: number | null = 7) {
  const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "series-1", title: "Night Signal", matchStatus: "confirmed", monitorMode: "all", comicvineVolumeId: 42, kapowarrVolumeId: volumeId }).returning())[0];
  const issue = (await database.db.insert(schema.issues).values({ followedSeriesId: follow.id, metronIssueId: 101, number: "1", storeDate: "2026-01-01", updatedAt: new Date().toISOString() }).returning())[0];
  const notification = (await database.db.insert(schema.notifications).values({ issueId: issue.id, type: "new_release", dedupeKey: "new-release:1" }).returning())[0];
  return { follow, issue, notification };
}

it("skips Kapowarr status calls for a follow without a saved volume", async () => {
  await fixture(null);
  expect(await check.checkKapowarr()).toEqual({ checked: 0, scanned: false });
});

it("caches volume status and counts only its queue entries", async () => {
  const { follow } = await fixture();
  let queued = true;
  server.use(http.get("http://kapowarr.test/api/volumes/7", () => HttpResponse.json({ error: null, result: { id: 7, comicvine_id: 42, issue_count: 20, issues_downloaded: 12, issues: [] } })), http.get("http://kapowarr.test/api/activity/queue", () => HttpResponse.json({ error: null, result: queued ? [{ volume_id: 7 }, { volume_id: 8 }] : [{ volume_id: 8 }] })));
  expect((await status.refreshKapowarrStatus(follow.id)).current).toEqual({ state: "downloading", queued: 1, filesHave: 12, filesTotal: 20 });
  expect(await status.getKapowarrStatus(follow.id)).toMatchObject({ state: "downloading" });
  queued = false;
  expect((await status.refreshKapowarrStatus(follow.id))).toMatchObject({ previous: { state: "downloading" }, current: { state: "files-ready", queued: 0 } });
});

it("debounces Komga scans for thirty minutes", async () => {
  await database.db.insert(schema.kvCache).values({ key: "settings:komga-library", valueJson: JSON.stringify({ id: "comics", name: "Comics" }), fetchedAt: new Date().toISOString(), ttlSeconds: 0 });
  let calls = 0;
  server.use(http.post("http://komga.test/api/v1/libraries/comics/scan", () => { calls++; return new HttpResponse(null, { status: 202 }); }));
  const now = new Date("2026-09-26T10:00:00Z");
  expect(await check.scanSelectedLibraryIfDue(now)).toBe(true);
  expect(await check.scanSelectedLibraryIfDue(new Date(now.getTime() + 29 * 60000))).toBe(false);
  expect(await check.scanSelectedLibraryIfDue(new Date(now.getTime() + 30 * 60000))).toBe(true);
  expect(calls).toBe(2);
});

it("manually requests a scan of the selected library, even within the automatic debounce", async () => {
  const request = () => scanRoute.POST(new Request("https://gutter.test/api/jobs/scan-komga", { method: "POST" }), { params: Promise.resolve({ name: "scan-komga" }) });
  expect((await request()).status).toBe(400);
  await database.db.insert(schema.kvCache).values({ key: "settings:komga-library", valueJson: JSON.stringify({ id: "comics", name: "Comics" }), fetchedAt: new Date().toISOString(), ttlSeconds: 0 });
  let calls = 0;
  server.use(http.post("http://komga.test/api/v1/libraries/comics/scan", ({ request }) => {
    expect(request.headers.get("X-API-Key")).toBe("key");
    calls++;
    return new HttpResponse(null, { status: 202 });
  }));
  expect((await request()).status).toBe(200);
  expect((await request()).status).toBe(200);
  expect(calls).toBe(2);
  expect(await check.scanSelectedLibraryIfDue()).toBe(false);
});

it("surfaces Komga scan permission errors without recording a successful scan", async () => {
  await database.db.insert(schema.kvCache).values({ key: "settings:komga-library", valueJson: JSON.stringify({ id: "comics", name: "Comics" }), fetchedAt: new Date().toISOString(), ttlSeconds: 0 });
  server.use(http.post("http://komga.test/api/v1/libraries/comics/scan", () => new HttpResponse(null, { status: 403 })));
  const response = await scanRoute.POST(new Request("https://gutter.test/api/jobs/scan-komga", { method: "POST" }), { params: Promise.resolve({ name: "scan-komga" }) });
  expect(response.status).toBe(502);
  expect((await response.json()).error).toContain("403");
  expect((await database.db.select().from(schema.kvCache).where(eq(schema.kvCache.key, "kapowarr:last-komga-scan")))[0]).toBeUndefined();
});

it("keeps a Kapowarr completion pending through the scan debounce and handles stale status", async () => {
  const { follow } = await fixture();
  await database.db.insert(schema.kvCache).values({ key: "settings:komga-library", valueJson: JSON.stringify({ id: "comics", name: "Comics" }), fetchedAt: new Date().toISOString(), ttlSeconds: 0 });
  let scans = 0;
  let queued = true;
  server.use(
    http.get("http://kapowarr.test/api/volumes/7", () => HttpResponse.json({ error: null, result: { id: 7, comicvine_id: 42, issue_count: 2, issues_downloaded: 1, issues: [] } })),
    http.get("http://kapowarr.test/api/activity/queue", () => HttpResponse.json({ error: null, result: queued ? [{ volume_id: 7 }] : [] })),
    http.post("http://komga.test/api/v1/libraries/comics/scan", () => { scans++; return new HttpResponse(null, { status: 202 }); }),
  );
  expect((await check.checkKapowarr())?.scanned).toBe(false);
  await database.db.insert(schema.kvCache).values({ key: "kapowarr:last-komga-scan", valueJson: JSON.stringify({ libraryId: "comics" }), fetchedAt: new Date().toISOString(), ttlSeconds: 1800 });
  queued = false;
  expect((await check.checkKapowarr())?.scanned).toBe(false);
  expect(scans).toBe(0);
  expect((await database.db.select().from(schema.kvCache).where(eq(schema.kvCache.key, "kapowarr:pending-komga-scan:comics")))[0]).toBeDefined();
  await database.db.update(schema.kvCache).set({ fetchedAt: new Date(Date.now() - 31 * 60000).toISOString() }).where(eq(schema.kvCache.key, "kapowarr:last-komga-scan"));
  expect((await check.checkKapowarr())?.scanned).toBe(true);
  expect(scans).toBe(1);
  expect((await database.db.select().from(schema.kvCache).where(eq(schema.kvCache.key, "kapowarr:pending-komga-scan:comics")))[0]).toBeUndefined();
  await database.db.update(schema.kvCache).set({ fetchedAt: new Date(Date.now() - 31 * 60000).toISOString() }).where(eq(schema.kvCache.key, `kapowarr:status:${follow.id}`));
  expect((await check.checkKapowarr())?.scanned).toBe(false);
  expect(scans).toBe(1);
});

it("retains a pending completion after a failed scan and retries it on the next check", async () => {
  await fixture();
  await database.db.insert(schema.kvCache).values({ key: "settings:komga-library", valueJson: JSON.stringify({ id: "comics", name: "Comics" }), fetchedAt: new Date().toISOString(), ttlSeconds: 0 });
  let attempts = 0;
  server.use(
    http.get("http://kapowarr.test/api/volumes/7", () => HttpResponse.json({ error: null, result: { id: 7, comicvine_id: 42, issue_count: 2, issues_downloaded: 1, issues: [] } })),
    http.get("http://kapowarr.test/api/activity/queue", () => HttpResponse.json({ error: null, result: [] })),
    http.post("http://komga.test/api/v1/libraries/comics/scan", () => { attempts++; return new HttpResponse(null, { status: attempts === 1 ? 403 : 202 }); }),
  );
  await expect(check.checkKapowarr()).rejects.toThrow("403");
  expect((await database.db.select().from(schema.kvCache).where(eq(schema.kvCache.key, "kapowarr:pending-komga-scan:comics")))[0]).toBeDefined();
  expect((await check.checkKapowarr())?.scanned).toBe(true);
  expect(attempts).toBe(2);
});

it("rejects invalid actions and makes mark read idempotent", async () => {
  const { notification } = await fixture();
  const url = "https://gutter.test/api/actions/mark-read";
  expect((await markRoute.POST(new Request(url, { method: "POST", body: "bad" }))).status).toBe(403);
  const token = tokens.createActionToken("mark-read", notification.id, process.env.ACTION_SECRET!);
  expect((await markRoute.POST(new Request(url, { method: "POST", body: token }))).status).toBe(200);
  const first = (await database.db.select().from(schema.notifications).where(eq(schema.notifications.id, notification.id)))[0].readAt;
  expect((await markRoute.POST(new Request(url, { method: "POST", body: token }))).status).toBe(200);
  expect((await database.db.select().from(schema.notifications).where(eq(schema.notifications.id, notification.id)))[0].readAt).toBe(first);
  const expired = tokens.createActionToken("mark-read", notification.id, process.env.ACTION_SECRET!, Date.now() - 31 * 86400000);
  expect((await markRoute.POST(new Request(url, { method: "POST", body: expired }))).status).toBe(410);
});

it("accepts a signed Kapowarr tap and rejects a token for another action", async () => {
  const { notification } = await fixture(null);
  const url = "https://gutter.test/api/actions/send-kapowarr";
  const wrong = tokens.createActionToken("mark-read", notification.id, process.env.ACTION_SECRET!);
  expect((await sendRoute.POST(new Request(url, { method: "POST", body: wrong }))).status).toBe(403);
  let searches = 0;
  server.use(http.get("http://kapowarr.test/api/volumes", () => HttpResponse.json({ error: null, result: [{ id: 7, comicvine_id: 42 }] })), http.post("http://kapowarr.test/api/system/tasks", () => { searches++; return HttpResponse.json({ error: null, result: {} }); }));
  const token = tokens.createActionToken("send-kapowarr", notification.id, process.env.ACTION_SECRET!);
  expect((await sendRoute.POST(new Request(url, { method: "POST", body: token }))).status).toBe(200);
  expect((await sendRoute.POST(new Request(url, { method: "POST", body: token }))).status).toBe(200);
  expect(searches).toBe(1);
});

it("sends one arrival per series after the first library sync, only for Kapowarr follows", async () => {
  const { follow } = await fixture();
  await database.db.insert(schema.issues).values({ followedSeriesId: follow.id, metronIssueId: 102, number: "2", storeDate: "2026-01-02", updatedAt: new Date().toISOString() });
  const other = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "series-2", title: "Other", matchStatus: "confirmed", monitorMode: "all" }).returning())[0];
  await database.db.insert(schema.issues).values({ followedSeriesId: other.id, metronIssueId: 103, number: "1", storeDate: "2026-01-01", updatedAt: new Date().toISOString() });
  let books = [{ id: "book-1", seriesId: "series-1", metadata: { number: "1" } }];
  let sends = 0; let title = "";
  server.use(
    http.post("http://komga.test/api/v1/series/list", () => HttpResponse.json({ content: [{ id: "series-1", name: "Night Signal" }, { id: "series-2", name: "Other" }], last: true })),
    http.post("http://komga.test/api/v1/books/list", () => HttpResponse.json({ content: books, last: true })),
    http.post("http://ntfy.test/comics", ({ request }) => { sends++; title = request.headers.get("Title") ?? ""; return HttpResponse.json({ id: "sent" }); }),
  );
  await sync.syncKomga();
  expect(sends).toBe(0);
  books = [...books, { id: "book-2", seriesId: "series-1", metadata: { number: "2" } }, { id: "book-3", seriesId: "series-2", metadata: { number: "1" } }];
  await sync.syncKomga();
  expect(sends).toBe(1);
  expect(title).toContain("1 new issue of Night Signal");
  await sync.syncKomga();
  expect(sends).toBe(1);
});
