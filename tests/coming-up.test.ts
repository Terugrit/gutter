import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

const directory = mkdtempSync(join(tmpdir(), "gutter-m04-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");
process.env.TZ = "Europe/Amsterdam";
process.env.METRON_USER = "test";
process.env.METRON_PASSWORD = "test";
process.env.NTFY_URL = "https://ntfy.example.test";
process.env.NTFY_TOPIC = "gutter";
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let metron: typeof import("@/lib/services/metron");
let upcoming: typeof import("@/lib/services/upcoming");
let digest: typeof import("@/jobs/weekly-digest");
const server = setupServer();
beforeAll(async () => {
  database = await import("@/db"); schema = await import("@/db/schema");
  metron = await import("@/lib/services/metron"); upcoming = await import("@/lib/services/upcoming"); digest = await import("@/jobs/weekly-digest");
  server.listen({ onUnhandledRequest: "error" });
});
beforeEach(() => { server.resetHandlers(); database.sqlite.exec("DELETE FROM notifications; DELETE FROM issues; DELETE FROM followed_series; DELETE FROM kv_cache;"); });
afterAll(() => { server.close(); database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

async function fixture() {
  const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "m04", title: "Night Signal", metronSeriesId: 10, matchStatus: "confirmed", monitorMode: "all", createdAt: "2026-01-01T00:00:00Z" }).returning())[0];
  return follow;
}

it("tracks a changed date once, and treats a missing date as an announcement", async () => {
  const follow = await fixture();
  let date: string | null = null;
  server.use(
    http.get("https://metron.cloud/api/series/:id/", () => HttpResponse.json({ id: 10, name: "Night Signal" })),
    http.get("https://metron.cloud/api/series/:id/issue_list/", () => HttpResponse.json({ count: 1, next: null, results: [{ id: 100, number: "7", store_date: date }] })),
    // Keep detail incomplete and cached so each refresh must trust the fresh list date.
    http.get("https://metron.cloud/api/issue/:id/", () => HttpResponse.json({ id: 100, number: "7", store_date: date, desc: null, credits: [] })),
  );
  await metron.cacheIssues(follow.id, 10, true);
  date = "2026-10-12";
  await metron.cacheIssues(follow.id, 10, true);
  let issue = (await database.db.select().from(schema.issues))[0];
  expect(issue).toMatchObject({ storeDate: "2026-10-12", previousDate: null, dateChangedAt: null });
  date = "2026-10-26";
  await metron.cacheIssues(follow.id, 10, true);
  issue = (await database.db.select().from(schema.issues))[0];
  expect(issue.previousDate).toBe("2026-10-12");
  expect(issue.dateChangedAt).toBeTypeOf("number");
  const changedAt = issue.dateChangedAt;
  await metron.cacheIssues(follow.id, 10, true);
  expect((await database.db.select().from(schema.issues))[0].dateChangedAt).toBe(changedAt);
});

it("shows only eligible future issues through the local 30-day boundary", async () => {
  const follow = await fixture();
  for (const [id, date, number, owned, skippedAt] of [[1, "2026-09-25", "1", 0, null], [2, "2026-09-26", "2", 0, null], [3, "2026-10-25", "3", 0, null], [4, "2026-10-26", "4", 0, null], [5, "2026-09-27", "5", 1, null], [6, "2026-09-28", "6", 0, 1], [7, "2026-09-29", "Annual 1", 0, null]] as const) {
    await database.db.insert(schema.issues).values({ followedSeriesId: follow.id, metronIssueId: id, number, storeDate: date, owned: Boolean(owned), skippedAt, updatedAt: new Date().toISOString() });
  }
  const rows = await upcoming.getUpcomingIssues(30, new Date("2026-09-25T09:00:00Z"));
  expect(rows.map((row) => row.number)).toEqual(["2", "3"]);
  expect(rows[0].week).toBe("2026-09-21");
  await database.db.update(schema.followedSeries).set({ matchStatus: "unmatched" }).where(eq(schema.followedSeries.id, follow.id));
  expect(await upcoming.getUpcomingIssues(30, new Date("2026-09-25T09:00:00Z"))).toEqual([]);
});

it("sends one slip-only digest and skips an empty week", async () => {
  const follow = await fixture();
  let body = ""; let sends = 0;
  server.use(http.post("https://ntfy.example.test/gutter", async ({ request }) => { body = await request.text(); sends++; return HttpResponse.json({ id: "sent" }); }));
  expect(await digest.weeklyDigest(new Date("2026-09-23T09:00:00Z"))).toBe(false);
  const changed = new Date("2026-09-24T09:00:00Z").getTime();
  await database.db.insert(schema.issues).values({ followedSeriesId: follow.id, metronIssueId: 7, number: "7", storeDate: "2026-10-26", previousDate: "2026-10-12", dateChangedAt: changed, updatedAt: new Date().toISOString() });
  expect(await digest.weeklyDigest(new Date("2026-09-25T09:00:00Z"))).toBe(true);
  expect(body).toContain("Moved\nNight Signal #7: 12 Oct → 26 Oct");
  expect(await digest.weeklyDigest(new Date("2026-09-25T09:00:00Z"))).toBe(false);
  expect(sends).toBe(1);
});
