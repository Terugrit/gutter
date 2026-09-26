import { describe, expect, it } from "vitest";
import fixture from "./fixtures/series.json";
import { rankMetronCandidates } from "./metron";
import type { MetronSeries } from "@/clients/metron/schemas";
describe("Metron matcher fixtures", () => {
  it("chooses the matching reboot year when titles are identical", () => {
    expect(rankMetronCandidates(fixture.slice(0, 2) as MetronSeries[], { title: "The Question", publisher: "DC", year: 2005 })[0].id).toBe(12);
  });
  it("leaves a different title unmatched", () => expect(rankMetronCandidates([fixture[2]] as MetronSeries[], { title: "Copper Sky", publisher: "Atlas", year: 2024 })[0].score).toBeLessThan(90));
});
