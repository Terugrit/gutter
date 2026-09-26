export type RecommendationSeed = {
  id: string;
  title: string;
  publisher: string;
  year?: number;
  genres?: string[];
  creators?: string[];
  writers?: string[];
  characters?: string[];
  seriesType?: string;
  followed: boolean;
};

export type RecommendationCandidate = {
  id: number;
  title: string;
  publisher: string;
  yearBegan?: number;
  genres?: string[];
  creators?: string[];
  writers?: string[];
  characters?: string[];
  seriesType?: string;
  coverUrl: string;
};

export type RankedRecommendation = RecommendationCandidate & {
  reason: string;
  why: RecommendationReason;
  seedId: string;
  overlaps: string[];
  score: number;
};

export type RecommendationReason = { kind: "writer" | "publisher" | "random"; name: string; sourceSeries?: string };
export function reasonText(reason: RecommendationReason) {
  if (reason.kind === "writer") return `Shares writer ${reason.name} with ${reason.sourceSeries}`;
  if (reason.kind === "publisher") return `Same publisher as ${reason.sourceSeries} (${reason.name})`;
  return `Random pick from ${reason.name}`;
}

type Match = { seed: RecommendationSeed; score: number; overlaps: string[] };

export function normalizedTitle(value: string) { return value.normalize("NFKD").toLocaleLowerCase().replace(/[^a-z0-9]/g, ""); }

export function yearInTitle(value: string): number | undefined {
  const match = value.match(/\(((?:19|20)\d{2})\)\s*$/);
  return match ? Number(match[1]) : undefined;
}

function hash(value: string) {
  let result = 2166136261;
  for (const character of value) result = Math.imul(result ^ character.charCodeAt(0), 16777619);
  return result >>> 0;
}

export function seededRandom(value: string) {
  let state = hash(value);
  return () => {
    state += 0x6D2B79F5;
    let next = state;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const next = Math.floor(random() * (index + 1));
    [result[index], result[next]] = [result[next], result[index]];
  }
  return result;
}

function overlap(first?: string[], second?: string[]) {
  const values = new Set((first ?? []).map((value) => value.toLocaleLowerCase()));
  return (second ?? []).some((value) => values.has(value.toLocaleLowerCase()));
}

function match(candidate: RecommendationCandidate, seed: RecommendationSeed): Match | null {
  let score = 0;
  const overlaps: string[] = [];
  if (candidate.publisher && seed.publisher && candidate.publisher.toLocaleLowerCase() === seed.publisher.toLocaleLowerCase() && candidate.publisher !== "Unknown publisher") { score += 5; overlaps.push("publisher"); }
  if (overlap(candidate.genres, seed.genres)) { score += 4; overlaps.push("genre"); }
  if (overlap(candidate.creators, seed.creators)) { score += 4; overlaps.push("creator"); }
  if (overlap(candidate.writers, seed.writers)) { score += 4; overlaps.push("writer"); }
  if (overlap(candidate.characters, seed.characters)) { score += 4; overlaps.push("character"); }
  if (candidate.seriesType && seed.seriesType && candidate.seriesType.toLocaleLowerCase() === seed.seriesType.toLocaleLowerCase()) { score += 2; overlaps.push("series type"); }
  if (candidate.yearBegan && seed.year) {
    const years = Math.abs(candidate.yearBegan - seed.year);
    if (years <= 10) { score += 3; overlaps.push("era"); }
    else if (years <= 25) { score += 1; overlaps.push("era"); }
  }
  return score ? { seed, score, overlaps } : null;
}

function reason(selected: Match) {
  const labels = selected.overlaps;
  if (labels.length === 1 && labels[0] === "era") return `From the same era as ${selected.seed.title}`;
  if (labels.length === 1) return `Same ${labels[0]} as ${selected.seed.title}`;
  return `Same ${labels.slice(0, -1).join(", ")} and ${labels.at(-1)} as ${selected.seed.title}`;
}
function whyThis(candidate: RecommendationCandidate, selected: Match): RecommendationReason {
  if (selected.overlaps.includes("writer")) {
    const writer = candidate.writers?.find((name) => selected.seed.writers?.some((other) => other.toLocaleLowerCase() === name.toLocaleLowerCase()));
    if (writer) return { kind: "writer", name: writer, sourceSeries: selected.seed.title };
  }
  if (selected.overlaps.includes("publisher")) return { kind: "publisher", name: candidate.publisher, sourceSeries: selected.seed.title };
  return { kind: "random", name: candidate.publisher };
}

export function rankRecommendations(input: {
  day: string;
  sequence?: number;
  seeds: RecommendationSeed[];
  candidates: RecommendationCandidate[];
  excludedIds: Set<number>;
  excludedTitles: Set<string>;
  lastShownAt: Record<string, string>;
  now: Date;
  exclusionDays: number;
  seedCount: number;
}): RankedRecommendation[] {
  const random = seededRandom(`${input.day}:${input.sequence ?? 0}`);
  const uniqueSeeds = new Map<string, RecommendationSeed>();
  for (const seed of input.seeds) uniqueSeeds.set(`${normalizedTitle(seed.title)}:${seed.publisher.toLocaleLowerCase()}`, seed);
  const sources = [...uniqueSeeds.values()].sort((a, b) => a.id.localeCompare(b.id));
  const followed = shuffle(sources.filter((seed) => seed.followed), random);
  const library = shuffle(sources.filter((seed) => !seed.followed), random);
  const selectedSeeds = [...followed.slice(0, Math.ceil(input.seedCount / 2)), ...library].slice(0, input.seedCount);
  for (const seed of followed) if (selectedSeeds.length < input.seedCount && !selectedSeeds.includes(seed)) selectedSeeds.push(seed);
  const cutoff = input.now.getTime() - input.exclusionDays * 86_400_000;
  const ranked = shuffle(input.candidates, random).flatMap((candidate) => {
    if (input.excludedIds.has(candidate.id) || input.excludedTitles.has(normalizedTitle(candidate.title))) return [];
    const lastShown = input.lastShownAt[String(candidate.id)];
    if (lastShown && Date.parse(lastShown) >= cutoff) return [];
    const matches = selectedSeeds.map((seed) => match(candidate, seed)).filter((value): value is Match => value !== null).sort((a, b) => b.score - a.score);
    return matches.length ? [{ candidate, matches, tie: random() }] : [];
  }).sort((a, b) => b.matches[0].score - a.matches[0].score || a.tie - b.tie);
  const shortlistPublishers = new Map<string, number>();
  const scored = ranked.filter((item) => {
    const count = shortlistPublishers.get(item.candidate.publisher) ?? 0;
    if (count >= 12) return false;
    shortlistPublishers.set(item.candidate.publisher, count + 1);
    return true;
  }).slice(0, 50);
  const chosen: RankedRecommendation[] = [];
  const publishers = new Map<string, number>();
  const seeds = new Map<string, number>();
  const seenTitles = new Set<string>();
  while (chosen.length < 10) {
    const eligible = scored.flatMap((item) => {
      if (seenTitles.has(normalizedTitle(item.candidate.title)) || (publishers.get(item.candidate.publisher) ?? 0) >= 3) return [];
      const available = item.matches.find((value) => (seeds.get(value.seed.id) ?? 0) < 2);
      return available ? [{ item, available }] : [];
    });
    if (!eligible.length) break;
    const total = eligible.reduce((sum, value) => sum + value.available.score ** 2, 0);
    let draw = random() * total;
    const selected = eligible.find((value) => { draw -= value.available.score ** 2; return draw < 0; }) ?? eligible.at(-1)!;
    const { candidate } = selected.item;
    const { available } = selected;
    chosen.push({ ...candidate, reason: reason(available), why: whyThis(candidate, available), seedId: available.seed.id, overlaps: available.overlaps, score: available.score });
    publishers.set(candidate.publisher, (publishers.get(candidate.publisher) ?? 0) + 1);
    seeds.set(available.seed.id, (seeds.get(available.seed.id) ?? 0) + 1);
    seenTitles.add(normalizedTitle(candidate.title));
    scored.splice(scored.indexOf(selected.item), 1);
  }
  return chosen;
}
