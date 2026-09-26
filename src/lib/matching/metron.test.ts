import { describe, expect, it } from "vitest";
import fixture from "./fixtures/series.json";
import { matchSearchTitle, rankMetronCandidates } from "./metron";
import type { MetronSeries } from "@/clients/metron/schemas";
describe("Metron matcher fixtures", () => {
  it("removes only a trailing parenthesized year from a Komga title", () => {
    expect(matchSearchTitle("The Question (2026)")).toBe("The Question");
    expect(matchSearchTitle("The Question (2026) Special")).toBe("The Question (2026) Special");
    expect(matchSearchTitle("1984")).toBe("1984");
  });
  it("chooses the matching reboot year when titles are identical", () => {
    expect(rankMetronCandidates(fixture.slice(0, 2) as MetronSeries[], { title: "The Question", publisher: "DC", year: 2005 })[0].id).toBe(12);
  });
  it("leaves a different title unmatched", () => expect(rankMetronCandidates([fixture[2]] as MetronSeries[], { title: "Copper Sky", publisher: "Atlas", year: 2024 })[0].score).toBeLessThan(90));
});
