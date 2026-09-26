import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { eq } from "drizzle-orm";

const directory = mkdtempSync(join(tmpdir(), "gutter-m03-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");
process.env.BACKUP_DIR = join(directory, "backups");
process.env.TZ = "Europe/Amsterdam";
process.env.METRON_USER = "test"; process.env.METRON_PASSWORD = "test";
delete process.env.NTFY_URL; delete process.env.NTFY_TOPIC;
const server = setupServer();
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let transfer: typeof import("@/lib/services/follows-transfer");
let backup: typeof import("@/jobs/backup-db");
let route: typeof import("@/app/api/import/follows/route");
beforeAll(async () => {
  database = await import("@/db"); schema = await import("@/db/schema");
  transfer = await import("@/lib/services/follows-transfer"); backup = await import("@/jobs/backup-db");
  route = await import("@/app/api/import/follows/route");
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  database.sqlite.exec("DELETE FROM notifications; DELETE FROM issues; DELETE FROM followed_series; DELETE FROM kv_cache;");
  server.resetHandlers();
});
afterAll(() => { server.close(); database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
const item = { komga_series_id: "discover:10", title: "Signal", publisher: "Harbor", metron_series_id: 10, comicvine_volume_id: 20, kapowarr_volume_id: 30, match_status: "confirmed" as const, monitor_mode: "future_only" as const, active: false, created_at: "2026-01-01T00:00:00Z", skipped_metron_issue_ids: [100] };
function metronHandlers() {
  server.use(
    http.get("https://metron.cloud/api/series/10/", () => HttpResponse.json({ id: 10, name: "Signal", status: "Completed" })),
    http.get("https://metron.cloud/api/series/10/issue_list/", () => HttpResponse.json({ count: 1, next: null, results: [{ id: 100, number: "1", store_date: "2026-09-01" }] })),
    http.get("https://metron.cloud/api/issue/100/", () => HttpResponse.json({ id: 100, number: "1", store_date: "2026-09-01", desc: "First light", credits: [] })),
  );
}
it("backs up live WAL data, replaces today's copy safely, and rotates only dated copies to seven", async () => {
  await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "backup-test", title: "Saved" });
  for (let day = 1; day <= 9; day++) await backup.backupDb(new Date(`2026-09-${String(day).padStart(2, "0")}T02:00:00Z`));
  const folder = process.env.BACKUP_DIR!;
  writeFileSync(join(folder, "keep.txt"), "unrelated");
  await database.db.update(schema.followedSeries).set({ title: "Updated" });
  await backup.backupDb(new Date("2026-09-08T23:00:00Z")); // Sep 9 in TZ.
  const files = readdirSync(folder);
  expect(files.filter((name) => name.endsWith(".db"))).toEqual(Array.from({ length: 7 }, (_, index) => `gutter-2026-09-0${index + 3}.db`));
  expect(files).toContain("keep.txt");
  expect(files.some((name) => name.endsWith(".tmp"))).toBe(false);
  const copy = new Database(join(folder, "gutter-2026-09-09.db"), { readonly: true });
  try {
    expect(copy.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(copy.prepare("SELECT title FROM followed_series").get()).toEqual({ title: "Updated" });
  } finally { copy.close(); }
  const { getJobStatus } = await import("@/jobs/status");
  expect(await getJobStatus("backup-db")).toMatchObject({ state: "success", lastSuccessAt: expect.any(String) });
  const failed = vi.spyOn(database.sqlite, "backup").mockRejectedValueOnce(new Error("Disk full"));
  try { await expect(backup.backupDb(new Date("2026-09-09T02:00:00Z"))).rejects.toThrow("Disk full"); }
  finally { failed.mockRestore(); }
  const retained = new Database(join(folder, "gutter-2026-09-09.db"), { readonly: true });
  try { expect(retained.prepare("SELECT title FROM followed_series").get()).toEqual({ title: "Updated" }); }
  finally { retained.close(); }
  expect(await getJobStatus("backup-db")).toMatchObject({ state: "failed", lastSuccessAt: expect.any(String) });
});
it("round-trips follows and skips after a wipe, reapplies ownership and never sends to Kapowarr", async () => {
  metronHandlers();
  const libraryItem = { ...item, komga_series_id: "komga-real" };
  const first = await transfer.importFollows({ version: 1, follows: [libraryItem] });
  expect(first).toEqual({ imported: 1, refreshed: 1, pending: 0 });
  await database.db.insert(schema.notifications).values({ issueId: 1, type: "new_release", dedupeKey: "private-history" });
  const exported = await transfer.exportFollows();
  expect(exported.follows[0]).toEqual({ ...libraryItem, active: true });
  expect(JSON.stringify(exported)).not.toContain("private-history");
  database.sqlite.exec("DELETE FROM notifications; DELETE FROM issues; DELETE FROM followed_series; DELETE FROM kv_cache;");
  await database.db.insert(schema.kvCache).values({ key: "komga:books", valueJson: JSON.stringify([{ seriesId: "komga-real", metadata: { number: "1" } }]), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 });
  expect(await transfer.importFollows(exported)).toEqual({ imported: 1, refreshed: 1, pending: 0 });
  const restored = (await database.db.select().from(schema.issues))[0];
  expect(restored).toMatchObject({ metronIssueId: 100, owned: true, skippedAt: expect.any(Number) });
  const { setIssueSkipped } = await import("@/lib/services/issue-controls");
  await setIssueSkipped(restored.id, false);
  const { refreshFollowedIssues } = await import("@/lib/services/metron");
  await refreshFollowedIssues();
  expect((await database.db.select().from(schema.issues))[0].skippedAt).toBeNull();
  expect(await database.db.select().from(schema.notifications)).toHaveLength(0);
}, 15000);
it("retains pending skip choices after metadata failure and applies them on normal refresh", async () => {
  server.use(http.get("https://metron.cloud/api/series/10/issue_list/", () => new HttpResponse(null, { status: 401 })));
  expect(await transfer.importFollows({ version: 1, follows: [item] })).toEqual({ imported: 1, refreshed: 0, pending: 1 });
  expect((await transfer.exportFollows()).follows[0].skipped_metron_issue_ids).toEqual([100]);
  metronHandlers();
  const { refreshFollowedIssues } = await import("@/lib/services/metron");
  await refreshFollowedIssues();
  expect((await database.db.select().from(schema.issues))[0].skippedAt).not.toBeNull();
  expect((await database.db.select().from(schema.kvCache)).filter((row) => row.key.startsWith("import:skips:"))).toEqual([]);
});
it("reactivates upserts and keeps other follows and notification history", async () => {
  metronHandlers();
  const old = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "discover:10", title: "Old", active: false, metronSeriesId: 5 }).returning())[0];
  await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "keep", title: "Keep" });
  const issue = (await database.db.insert(schema.issues).values({ followedSeriesId: old.id, metronIssueId: 50, number: "1", updatedAt: new Date().toISOString() }).returning())[0];
  await database.db.insert(schema.notifications).values({ issueId: issue.id, type: "new_release", dedupeKey: "retain" });
  await transfer.importFollows({ version: 1, follows: [item] });
  await transfer.importFollows({ version: 1, follows: [item] });
  expect(await database.db.select().from(schema.followedSeries)).toHaveLength(2);
  expect((await database.db.select().from(schema.followedSeries).where(eq(schema.followedSeries.id, old.id)))[0]).toMatchObject({ active: true, metronSeriesId: 10 });
  expect((await database.db.select().from(schema.issues).where(eq(schema.issues.id, issue.id)))[0].active).toBe(false);
  expect(await database.db.select().from(schema.notifications)).toHaveLength(1);
});
it("rejects malformed, mismatched, duplicate and oversized imports before writing anything", async () => {
  for (const input of ["broken", { version: 2, follows: [] }, { version: 1, follows: [{ ...item, komga_series_id: "discover:11" }] }, { version: 1, follows: [item, item] }]) {
    const response = await route.POST(new Request("http://localhost/api/import/follows", { method: "POST", body: typeof input === "string" ? input : JSON.stringify(input) }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/file/i);
  }
  const oversized = await route.POST(new Request("http://localhost/api/import/follows", { method: "POST", body: "x", headers: { "Content-Length": "6000000" } }));
  expect(oversized.status).toBe(413);
  expect(await database.db.select().from(schema.followedSeries)).toEqual([]);
  const { GET } = await import("@/app/api/export/follows/route");
  const download = await GET();
  expect(download.headers.get("Content-Disposition")).toContain("gutter-follows.json");
  expect(await download.json()).toEqual({ version: 1, follows: [] });
});
