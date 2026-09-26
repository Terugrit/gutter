import { describe, expect, it } from "vitest";
import { readingStatsFromBooks } from "./reading";

describe("readingStatsFromBooks", () => it("uses Komga readProgress without inferring absent progress", () => {
  expect(readingStatsFromBooks([
    { seriesId: "a", readProgress: { completed: true, readDate: "2026-09-03T10:00:00Z" } },
    { seriesId: "a", readProgress: { completed: true, readDate: "2026-08-03T10:00:00Z" } },
    { seriesId: "b", readProgress: { completed: false } },
    { seriesId: "c" },
  ], new Date("2026-09-21T00:00:00Z"))).toEqual({ booksRead: 2, inProgress: 1, seriesCompleted: 1, readThisMonth: 1 });
}));
