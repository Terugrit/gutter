import type { MetronSeries } from "@/clients/metron/schemas";

export type MatchInput = { title: string; publisher?: string | null; year?: number | null };
export type ScoredCandidate = MetronSeries & { score: number };
function normalized(value: string | null | undefined) { return (value ?? "").toLocaleLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }
export function rankMetronCandidates(candidates: MetronSeries[], input: MatchInput): ScoredCandidate[] {
  return candidates.map((candidate) => {
    let score = normalized(candidate.series) === normalized(input.title) ? 80 : 0;
    if (input.publisher && normalized(candidate.publisher?.name) === normalized(input.publisher)) score += 10;
    if (input.year && candidate.year_began === input.year) score += 10;
    return { ...candidate, score };
  }).sort((a, b) => b.score - a.score);
}
