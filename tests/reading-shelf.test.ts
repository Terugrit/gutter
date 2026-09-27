import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "gutter-shelf-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");
const now = new Date().toISOString();
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let shelf: typeof import("@/lib/services/reading-shelf");

beforeAll(async () => {
  database = await import("@/db");
  schema = await import("@/db/schema");
  shelf = await import("@/lib/services/reading-shelf");
});
afterAll(() => { database?.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });

it("saves cached series once without following and survives recommendation rotation", async () => {
  await database.db.insert(schema.kvCache).values({ key: "discover:recommendations", valueJson: JSON.stringify({ recommended: [{ id: 913, title: "Harbor Light", publisher: "Northfield", yearBegan: 2021, coverUrl: "/cover.png", reason: "Same publisher" }], different: [] }), fetchedAt: now, ttlSeconds: 3600 });
  expect((await shelf.saveToReadingShelf(913))?.title).toBe("Harbor Light");
  await shelf.saveToReadingShelf(913);
  expect(await shelf.getSavedShelfIds()).toEqual([913]);
  expect(await database.db.select().from(schema.followedSeries)).toHaveLength(0);
  await database.db.update(schema.kvCache).set({ valueJson: JSON.stringify({ recommended: [], different: [] }) });
  expect(await shelf.getReadingShelf()).toEqual([expect.objectContaining({ id: 913, title: "Harbor Light", yearBegan: 2021, coverUrl: "/cover.png", sent: false })]);
});

it("uses the cached pool after a recommendation rotates away", async () => {
  await database.db.insert(schema.kvCache).values({ key: "discover:pool", valueJson: JSON.stringify({ entries: [{ id: 914, title: "Iron Coast", publisher: "Harbor", yearBegan: 2019, coverUrl: null }] }), fetchedAt: now, ttlSeconds: 3600 });
  expect((await shelf.saveToReadingShelf(914))?.yearBegan).toBe(2019);
  expect(await shelf.saveToReadingShelf(999999)).toBeNull();
});

it("reuses a sent volume and removing a card leaves its follow intact", async () => {
  await database.db.insert(schema.followedSeries).values({ komgaSeriesId: "discover:913", title: "Harbor Light", metronSeriesId: 913, comicvineVolumeId: 44, kapowarrVolumeId: 88, matchStatus: "confirmed" });
  expect(await shelf.sendShelfSeriesToKapowarr(913)).toEqual({ volumeId: 88, existing: true });
  expect((await shelf.getReadingShelf()).find((item) => item.id === 913)?.sent).toBe(true);
  await shelf.removeFromReadingShelf(913);
  await shelf.removeFromReadingShelf(913);
  expect(await shelf.getSavedShelfIds()).toEqual([914]);
  expect(await database.db.select().from(schema.followedSeries)).toHaveLength(1);
});
