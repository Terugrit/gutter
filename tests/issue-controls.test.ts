import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { eq } from "drizzle-orm";

const directory = mkdtempSync(join(tmpdir(), "gutter-m02-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");
process.env.TZ = "Europe/Amsterdam";
process.env.METRON_USER = "test";
process.env.METRON_PASSWORD = "test";
process.env.NTFY_URL = "https://ntfy.example.test";
process.env.NTFY_TOPIC = "gutter";
process.env.APP_BASE_URL = "https://gutter.example.test";
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let controls: typeof import("@/lib/services/issue-controls");
let missing: typeof import("@/lib/services/missing");
let progress: typeof import("@/lib/services/series-progress");
let metron: typeof import("@/lib/services/metron");
let route: typeof import("@/app/api/issues/[id]/skip/route");
const server = setupServer();
beforeAll(async () => {
  database = await import("@/db"); schema = await import("@/db/schema");
  controls = await import("@/lib/services/issue-controls"); missing = await import("@/lib/services/missing");
  progress = await import("@/lib/services/series-progress"); metron = await import("@/lib/services/metron");
  route = await import("@/app/api/issues/[id]/skip/route");
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => {
  server.resetHandlers();
  database.sqlite.exec("DELETE FROM notifications; DELETE FROM issues; DELETE FROM followed_series; DELETE FROM kv_cache;");
});
afterAll(() => { vi.useRealTimers(); server.close(); database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
async function fixture() {
  const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "m02", title: "Signal", monitorMode: "all", matchStatus: "confirmed", createdAt: "2020-01-01T00:00:00Z" }).returning())[0];
  const issue = (await database.db.insert(schema.issues).values({ followedSeriesId: follow.id, metronIssueId: 100, number: "1", storeDate: "2026-09-21", updatedAt: new Date().toISOString() }).returning())[0];
  return { follow, issue };
}
it("validates skip requests and restores missing issues without resetting the skip timestamp", async () => {
  const { issue, follow } = await fixture();
  const post = (id: string, body: unknown) => route.POST(new Request("http://localhost/api/issues/1/skip", { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
  expect((await post(String(issue.id), { skipped: "true" })).status).toBe(400);
  expect((await post("NaN", { skipped: true })).status).toBe(400);
  expect((await post("99999", { skipped: true })).status).toBe(404);
  expect(await missing.getMissingIssues()).toHaveLength(1);
  const response = await post(String(issue.id), { skipped: true });
  expect(response.status).toBe(200);
  const skipped = await response.json();
  expect(skipped.skippedAt).toBeTypeOf("number");
  expect(await controls.setIssueSkipped(issue.id, true)).toEqual(skipped);
  expect(await missing.getMissingIssues()).toEqual([]);
  expect((await post(String(issue.id), { skipped: false })).status).toBe(200);
  expect(await missing.getMissingIssues()).toHaveLength(1);
  await database.db.update(schema.followedSeries).set({ active: false }).where(eq(schema.followedSeries.id, follow.id));
  expect((await post(String(issue.id), { skipped: true })).status).toBe(404);
});
it("excludes skipped issues from both jobs and restores eligibility without duplicate sends", async () => {
  const { issue } = await fixture();
  let sends = 0;
  server.use(http.post("https://ntfy.example.test/gutter", () => { sends++; return HttpResponse.json({ id: "sent" }); }));
  const { refreshReleases } = await import("@/jobs/refresh-releases");
  const { weeklyDigest } = await import("@/jobs/weekly-digest");
  await controls.setIssueSkipped(issue.id, true);
  expect(await refreshReleases()).toBe(0);
  expect(await weeklyDigest(new Date("2026-09-23T09:00:00Z"))).toBe(false);
  expect(sends).toBe(0);
  await controls.setIssueSkipped(issue.id, false);
  expect(await refreshReleases()).toBe(1);
  expect(await weeklyDigest(new Date("2026-09-23T09:00:00Z"))).toBe(true);
  await controls.setIssueSkipped(issue.id, true);
  await controls.setIssueSkipped(issue.id, false);
  expect(await refreshReleases()).toBe(0);
  expect(await weeklyDigest(new Date("2026-09-23T09:00:00Z"))).toBe(false);
  expect(sends).toBe(2);
});
it("preserves skip and notification history through refresh and rematch, without copying it to another issue", async () => {
  const { issue, follow } = await fixture();
  await database.db.update(schema.followedSeries).set({ metronSeriesId: 10 }).where(eq(schema.followedSeries.id, follow.id));
  const skipped = await controls.setIssueSkipped(issue.id, true);
  await database.db.insert(schema.notifications).values({ issueId: issue.id, type: "new_release", dedupeKey: "history", sentAt: "2026-09-21T09:00:00Z" });
  let status: string | null = "Completed";
  server.use(
    http.get("https://metron.cloud/api/series/", () => HttpResponse.json({ count: 0, next: null, results: [] })),
    http.get("https://metron.cloud/api/series/:id/", ({ params }) => HttpResponse.json({ id: Number(params.id), name: "Signal", status, cv_id: 5 })),
    http.get("https://metron.cloud/api/series/:id/issue_list/", ({ params }) => HttpResponse.json({ count: 1, next: null, results: [{ id: Number(params.id) * 10, number: "1", store_date: "2026-09-21" }] })),
    http.get("https://metron.cloud/api/issue/:id/", ({ params }) => HttpResponse.json({ id: Number(params.id), number: "1", store_date: "2026-09-21", desc: "Detail", credits: [] })),
  );
  await metron.refreshFollowedIssues();
  expect((await database.db.select().from(schema.followedSeries))[0].seriesStatus).toBe("completed");
  await metron.confirmMatch("m02", 20);
  const other = (await database.db.select().from(schema.issues).where(eq(schema.issues.metronIssueId, 200)))[0];
  expect(other.skippedAt).toBeNull();
  expect((await database.db.select().from(schema.issues).where(eq(schema.issues.id, issue.id)))[0].active).toBe(false);
  await metron.confirmMatch("m02", 10);
  const restored = (await database.db.select().from(schema.issues).where(eq(schema.issues.id, issue.id)))[0];
  expect(restored).toMatchObject({ active: true, skippedAt: skipped!.skippedAt });
  expect(await database.db.select().from(schema.notifications)).toHaveLength(1);
  status = null;
  await metron.refreshFollowedIssues();
  expect((await database.db.select().from(schema.followedSeries))[0].seriesStatus).toBeNull();
}, 20000);
it("calculates all progress states, exclusions, future copies, and the local midnight boundary", () => {
  const issue = { number: "1", title: null, storeDate: "2026-09-25", owned: true, active: true, skippedAt: null };
  const rows = [issue, { ...issue, number: "2", owned: false }, { ...issue, number: "3", skippedAt: 0 }, { ...issue, number: "4", active: false }, { ...issue, number: "5A" }, { ...issue, number: "6", title: "Annual" }, { ...issue, number: "7", storeDate: "2099-01-01" }, { ...issue, number: "8", storeDate: null }];
  expect(progress.getSeriesProgress(rows, "completed", "2026-09-25")).toEqual({ owned: 1, released: 2, total: 4, state: "incomplete" });
  for (const status of ["ongoing", "hiatus", null, "unknown"]) expect(progress.getSeriesProgress([issue], status, "2026-09-25").state).toBe("up-to-date");
  for (const status of ["completed", "cancelled"]) expect(progress.getSeriesProgress([issue], status, "2026-09-25").state).toBe("complete");
  expect(progress.getSeriesProgress([], "completed", "2026-09-25").state).toBe("incomplete");
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-09-24T21:59:59Z"));
    expect(progress.getSeriesProgress([issue], null).released).toBe(0);
    vi.setSystemTime(new Date("2026-09-24T22:00:00Z"));
    expect(progress.getSeriesProgress([issue], null).released).toBe(1);
  } finally { vi.useRealTimers(); }
  expect(progress.normalizeSeriesStatus("Completed")).toBe("completed");
  expect(progress.normalizeSeriesStatus("Unrecognized")).toBeNull();
  expect(missing.excludedIssue("1", null, 0)).toBe(true);
  expect(missing.excludedIssue("1", null, null)).toBe(false);
});
it("keeps existing rows and skip choices when migrations are rerun", async () => {
  const { issue } = await fixture();
  const skipped = await controls.setIssueSkipped(issue.id, true);
  const { migrateSchema } = await import("@/db/migrate-schema");
  migrateSchema(database.sqlite); migrateSchema(database.sqlite);
  expect((await database.db.select().from(schema.issues))[0]).toMatchObject({ id: issue.id, skippedAt: skipped!.skippedAt });
});
