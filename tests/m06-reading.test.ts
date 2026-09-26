import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const directory = mkdtempSync(join(tmpdir(), "gutter-m06-"));
process.env.GUTTER_DB_PATH = join(directory, "app.db");
process.env.TZ = "America/New_York";
let database: typeof import("@/db");
let schema: typeof import("@/db/schema");
let suggestions: typeof import("@/lib/services/follow-suggestions");
let recap: typeof import("@/lib/services/recap");
let recommendation: typeof import("@/lib/services/recommendations");
beforeAll(async () => {
  database = await import("@/db"); schema = await import("@/db/schema");
  suggestions = await import("@/lib/services/follow-suggestions");
  recap = await import("@/lib/services/recap");
  recommendation = await import("@/lib/services/recommendations");
});
beforeEach(() => { database.sqlite.exec("DELETE FROM issues; DELETE FROM followed_series; DELETE FROM kv_cache;"); });
afterAll(() => { database.sqlite.close(); rmSync(directory, { recursive: true, force: true }); });
const completed = (id: string, date: string) => ({ id: `${id}:${date}`, seriesId: id, readProgress: { completed: true, readDate: date } });

it("suggests only recent, independently read books and persists dismissals", async () => {
  const now = new Date("2026-09-26T12:00:00Z");
  const series = ["a", "b", "c", "d", "e", "f"].map((id, index) => ({ id, t: `Series ${id}`, pub: "Press", seed: index }));
  const books = [completed("a", "2026-09-25T10:00:00Z"), completed("a", "2026-09-24T10:00:00Z"), completed("b", "2026-09-22T10:00:00Z"), completed("b", "2026-09-21T10:00:00Z"), completed("c", "2026-07-28T12:00:00Z"), completed("c", "2026-09-20T10:00:00Z"), completed("d", "2026-07-28T11:59:59Z"), completed("d", "2026-09-20T10:00:00Z"), completed("e", "2026-09-23T10:00:00Z"), { id: "e:in-progress", seriesId: "e", readProgress: { completed: false } }, completed("f", "2026-09-19T10:00:00Z"), completed("f", "2026-09-18T10:00:00Z")];
  expect(suggestions.suggestFromReading(series, books, new Set(["b"]), new Set(["f"]), now).map((item) => item.id)).toEqual(["a", "c"]);
  expect(suggestions.suggestFromReading(series, books, new Set(), new Set(), now).map((item) => item.id)).toEqual(["a", "b", "c", "f"]);
  const cache = async (key: string, value: unknown) => database.db.insert(schema.kvCache).values({ key, valueJson: JSON.stringify(value), fetchedAt: now.toISOString(), ttlSeconds: 3600 });
  expect(await suggestions.getFollowSuggestions()).toEqual([]); // no Komga sync
  await cache("komga:series", series); await cache("komga:books", books);
  expect((await suggestions.getFollowSuggestions()).map((item) => item.id)).toContain("a");
  expect(await suggestions.dismissFollowSuggestion("a")).toBe(true);
  expect(await suggestions.dismissFollowSuggestion("a")).toBe(true);
  expect(await suggestions.dismissFollowSuggestion("missing")).toBe(false);
  const row = database.sqlite.prepare("SELECT value_json FROM kv_cache WHERE key='follow-suggestions:dismissed'").get() as { value_json: string };
  expect(JSON.parse(row.value_json)).toEqual(["a"]);
});

it("aggregates in configured timezone, crosses month ends, and never guesses missing completion dates", () => {
  const books = [completed("a", "2026-02-01T04:30:00Z"), completed("a", "2026-02-01T12:00:00Z"), completed("b", "2026-02-02T12:00:00Z"), completed("b", "2026-12-31T23:00:00Z"), completed("c", "2027-01-01T04:30:00Z"), { id: "c:unknown", seriesId: "c", readProgress: { completed: true, readDate: null } }, { id: "d:unread", seriesId: "d" }];
  const result = recap.recapFromBooks(books, new Map([["a", "Alpha"], ["b", "Beta"]]), 2026);
  expect(result.booksCompleted).toBe(5);
  expect(result.months[0]).toBe(1); expect(result.months[1]).toBe(2); expect(result.months[11]).toBe(2);
  expect(result.longestStreak).toBe(3); // Jan 31, Feb 1, Feb 2
  expect(result.seriesFinished).toBe(2);
  expect(result.busiestMonth).toBe(2);
  expect(result.topSeries.map((item) => item.title)).toEqual(["Alpha", "Beta", "c"]);
  expect(recap.recapFromBooks([], new Map(), 2025).busiestMonth).toBeNull();
});

it("accepts old recommendation cache without a fabricated why line", () => {
  const old = { recommended: [{ id: 1, title: "Old", publisher: "Press", reason: "Same publisher as X", coverUrl: "" }], different: [] };
  expect(recommendation.recommendationSetsSchema.parse(old).recommended[0].why).toBeUndefined();
  expect(recommendation.recommendationSetsSchema.parse({ recommended: [{ ...old.recommended[0], why: { kind: "publisher", name: "Press", sourceSeries: "X" } }], different: [] }).recommended[0].why?.kind).toBe("publisher");
});
