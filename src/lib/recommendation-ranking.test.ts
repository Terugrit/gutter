import { describe, expect, it } from "vitest";
import { rankRecommendations, type RecommendationCandidate, type RecommendationSeed } from "./recommendation-ranking";

const seeds: RecommendationSeed[] = Array.from({ length: 5 }, (_, index) => ({ id: `seed-${index}`, title: `Seed ${index}`, publisher: `House ${index}`, year: 2020, followed: index < 2 }));
const candidates: RecommendationCandidate[] = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, title: `${index < 50 ? "A" : "Z"} Series ${String(index).padStart(2, "0")}`, publisher: `House ${index % 5}`, yearBegan: 2020, coverUrl: "" }));
const input = (day: string) => ({ day, seeds, candidates, excludedIds: new Set<number>(), excludedTitles: new Set<string>(), lastShownAt: {} as Record<string, string>, now: new Date(`${day}T12:00:00Z`), exclusionDays: 14, seedCount: 5 });

describe("local Recommended ranking", () => {
  it("draws across the alphabet rather than taking the first name-sorted results", () => {
    const result = rankRecommendations(input("2026-09-24"));
    expect(result).toHaveLength(10);
    const acrossDays = Array.from({ length: 10 }, (_, offset) => rankRecommendations(input(`2026-09-${String(15 + offset).padStart(2, "0")}`)));
    expect(acrossDays.flat().filter((item) => item.title.startsWith("Z")).length).toBeGreaterThan(25);
    expect(result.map((item) => item.title)).not.toEqual([...result.map((item) => item.title)].sort());
    expect(result.every((item) => item.reason.includes("Seed") && item.overlaps.length > 0)).toBe(true);
  });

  it("is stable during a day, changes the next day, and excludes recent shows", () => {
    const first = rankRecommendations(input("2026-09-24"));
    expect(rankRecommendations(input("2026-09-24")).map((item) => item.id)).toEqual(first.map((item) => item.id));
    const history = Object.fromEntries(first.map((item) => [String(item.id), "2026-09-24T12:00:00Z"]));
    const second = rankRecommendations({ ...input("2026-09-25"), lastShownAt: history });
    expect(second).toHaveLength(10);
    expect(second.every((item) => !first.some((prior) => prior.id === item.id))).toBe(true);
  });

  it("excludes library, followed, and Random entries and enforces both caps", () => {
    const result = rankRecommendations({ ...input("2026-09-26"), excludedIds: new Set([1, 2]), excludedTitles: new Set(["zseries50"]) });
    expect(result.every((item) => ![1, 2, 51].includes(item.id))).toBe(true);
    for (const seed of seeds) expect(result.filter((item) => item.seedId === seed.id).length).toBeLessThanOrEqual(2);
    for (const publisher of new Set(result.map((item) => item.publisher))) expect(result.filter((item) => item.publisher === publisher).length).toBeLessThanOrEqual(3);
  });

  it("keeps enough publishers in the shortlist when two dominate the pool", () => {
    const crowded: RecommendationCandidate[] = Array.from({ length: 200 }, (_, index) => ({
      id: index + 1, title: `Crowded ${index}`, publisher: `House ${index % 2}`, yearBegan: 2020, coverUrl: "",
    }));
    const varied: RecommendationCandidate[] = Array.from({ length: 30 }, (_, index) => ({
      id: index + 201, title: `Varied ${index}`, publisher: `House ${2 + index % 3}`, yearBegan: 2020, coverUrl: "",
    }));
    const result = rankRecommendations({ ...input("2026-09-24"), candidates: [...crowded, ...varied] });
    expect(result).toHaveLength(10);
    expect(new Set(result.map((item) => item.publisher)).size).toBeGreaterThanOrEqual(4);
  });
});
