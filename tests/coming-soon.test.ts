import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";

const directory = mkdtempSync(join(tmpdir(), "gutter-coming-soon-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");
process.env.TZ = "UTC";
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let service: typeof import("@/lib/services/coming-soon");

beforeAll(async () => {
  database = await import("@/db");
  schema = await import("@/db/schema");
  service = await import("@/lib/services/coming-soon");
});
beforeEach(() => database.sqlite.exec("DELETE FROM release_shelf; DELETE FROM watches; DELETE FROM upcoming_releases; DELETE FROM dismissed_series; DELETE FROM interest_filters; DELETE FROM interest_weights; DELETE FROM issues; DELETE FROM followed_series; DELETE FROM notifications; DELETE FROM kv_cache;"));
afterAll(() => { database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

async function candidate(seriesName: string, publisher: string, date = "2026-11-04", metronSeriesId: number | null = null) {
  return (await database.db.insert(schema.upcomingReleases).values({ metronSeriesId, seriesName, issueNumber: "1", publisher, genresJson: "[]", expectedReleaseDate: date, releaseConfidence: "solicited", source: "metron", lastRefreshedAt: new Date().toISOString() }).returning())[0];
}

it("selects an intentional wildcard outside the local publisher interests", async () => {
  await database.db.insert(schema.kvCache).values({ key: "komga:series", valueJson: JSON.stringify([{ pub: "Harbor", metadata: { genres: ["Mystery"] } }]), fetchedAt: new Date().toISOString(), ttlSeconds: 3600 });
  await candidate("Signal One", "Harbor");
  await candidate("Signal Two", "Harbor");
  await candidate("Far Shore", "Other");
  const rows = await service.getComingSoon(3, () => 0);
  expect(rows).toHaveLength(3);
  expect(rows.filter((row) => row.isWildcard).map((row) => row.seriesName)).toEqual(["Far Shore"]);
  await service.addInterestFilter("publisher", "Other");
  expect((await service.getComingSoon(3, () => 0)).some((row) => row.seriesName === "Far Shore")).toBe(false);
});

it("persists issue watches idempotently and records an unfollow as expired", async () => {
  const release = await candidate("Paper Moon", "Harbor");
  const first = await service.watchUpcomingRelease(release.id, "issue");
  const second = await service.watchUpcomingRelease(release.id, "series");
  expect(first?.id).toBe(second?.id);
  expect(second?.scope).toBe("series");
  await service.unwatchUpcomingRelease(second!.id);
  expect((await database.db.select().from(schema.watches))[0].outcome).toBe("expired");
});

it("moves due watches onto the release shelf once and auto-clears after Kapowarr finishes", async () => {
  const follow = (await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "discover:77", title: "Night Signal", metronSeriesId: 77, kapowarrVolumeId: 9, matchStatus: "confirmed" }).returning())[0];
  const release = await candidate("Night Signal", "Harbor", "2026-09-01", 77);
  await database.db.insert(schema.watches).values({ upcomingReleaseId: release.id, status: "watching", scope: "series", outcome: "pending", createdAt: "2026-08-01T00:00:00Z" });
  expect(await service.checkReleaseDates(new Date("2026-09-02T12:00:00Z"))).toBe(1);
  expect(await service.checkReleaseDates(new Date("2026-09-02T12:00:00Z"))).toBe(0);
  expect(await service.getReleaseShelf(new Date("2026-09-02T12:00:00Z"))).toHaveLength(1);
  expect(await service.updateReleaseShelfForKapowarr(follow.id, { state: "downloading", filesHave: 0 }, { state: "files-ready", filesHave: 1 })).toBe(1);
  expect(await service.getReleaseShelf()).toHaveLength(0);
  expect((await database.db.select().from(schema.watches))[0].outcome).toBe("downloaded");
});

it("dismisses a series persistently and tunes publisher feedback", async () => {
  const kept = await candidate("Kept", "Harbor", "2026-11-01", 80);
  const dismissed = await candidate("Dismissed", "Other", "2026-11-01", 81);
  await service.dismissUpcomingSeries({ metronSeriesId: 81 });
  expect((await service.getComingSoon(10, () => 0)).map((row) => row.id)).toEqual([kept.id]);
  await database.db.insert(schema.watches).values({ upcomingReleaseId: kept.id, status: "released", scope: "issue", outcome: "downloaded", createdAt: new Date().toISOString() });
  expect(await service.tuneInterestWeights()).toBe(1);
  expect((await database.db.select().from(schema.interestWeights).where(eq(schema.interestWeights.value, "Harbor")))[0].score).toBeGreaterThan(100);
  expect(dismissed.id).toBeGreaterThan(0);
});
