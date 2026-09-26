import { eq } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries, kvCache } from "@/db/schema";
import { env } from "@/env";
import { sampleMetronSeriesPages, previewMetronIssues } from "@/lib/services/metron";
import { localDate, runTrackedJob } from "@/jobs/status";
import { normalizedTitle, rankRecommendations, yearInTitle, type RecommendationSeed } from "@/lib/recommendation-ranking";

export type Recommendation = { id: number; title: string; publisher: string; reason: string; coverUrl: string; seedId?: string; overlaps?: string[]; score?: number };
export type RecommendationSets = { recommended: Recommendation[]; different: Recommendation[] };
type KomgaSeries = { id: string; t: string; pub: string; metadata?: { genres?: string[] } };
type KomgaBook = { seriesId: string; metadata?: { releaseDate?: string } };
type PoolEntry = { id: number; title: string; publisher: string; checked: boolean; coverUrl: string | null; yearBegan?: number | null; issueCount?: number | null };
type DiscoverPool = { entries: PoolEntry[]; shownIds: number[] };
const KEY = "discover:recommendations";
const POOL_KEY = "discover:pool";
const HISTORY_KEY = "discover:recommended-history";
const DAY_KEY = "discover:recommended-day";
const TTL = 7 * 24 * 60 * 60;
const MAX_CANDIDATE_CHECKS = 10;
const MAX_REFRESH_MS = 45_000;
const POOL_SIZE = 200;

async function cache<T>(key: string): Promise<T | null> {
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, key)))[0];
  if (!row) return null;
  try { return JSON.parse(row.valueJson) as T; } catch { return null; }
}
async function save(value: RecommendationSets) {
  const now = new Date().toISOString();
  await db.insert(kvCache).values({ key: KEY, valueJson: JSON.stringify(value), fetchedAt: now, ttlSeconds: TTL }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(value), fetchedAt: now, ttlSeconds: TTL } });
}
async function saveJson(key: string, value: unknown) {
  const now = new Date().toISOString();
  await db.insert(kvCache).values({ key, valueJson: JSON.stringify(value), fetchedAt: now, ttlSeconds: 365 * 24 * 60 * 60 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(value), fetchedAt: now } });
}
async function savePool(value: DiscoverPool) {
  const now = new Date().toISOString();
  await db.insert(kvCache).values({ key: POOL_KEY, valueJson: JSON.stringify(value), fetchedAt: now, ttlSeconds: 30 * 24 * 60 * 60 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(value), fetchedAt: now } });
}
export async function getRecommendations(): Promise<RecommendationSets> {
  let sets = (await cache<RecommendationSets>(KEY)) ?? { recommended: [], different: [] };
  if (process.env.GUTTER_VISUAL_TEST !== "1") sets = await updateRecommended(sets, false);
  const [dismissed, follows, library] = await Promise.all([dismissedIds(), db.select().from(followedSeries).where(eq(followedSeries.active, true)), cache<KomgaSeries[]>("komga:series")]);
  const ids = new Set([...dismissed, ...follows.map((item) => item.metronSeriesId).filter((id): id is number => id !== null)]);
  const titles = new Set([...(library ?? []).map((item) => normalizedTitle(item.t)), ...follows.map((item) => normalizedTitle(item.title))]);
  const seen = new Set<string>();
  const visible = (items: Recommendation[]) => items.filter((item) => { const title = normalizedTitle(item.title); if (ids.has(item.id) || titles.has(title) || seen.has(title)) return false; seen.add(title); return true; });
  return { recommended: visible(sets.recommended), different: visible(sets.different) };
}
async function dismissedIds() { return (await cache<number[]>("discover:dismissed")) ?? []; }
export async function dismissRecommendation(id: number) {
  const values = new Set(await dismissedIds()); values.add(id);
  const now = new Date().toISOString();
  await db.insert(kvCache).values({ key: "discover:dismissed", valueJson: JSON.stringify([...values]), fetchedAt: now, ttlSeconds: 365 * 24 * 60 * 60 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify([...values]), fetchedAt: now, ttlSeconds: 365 * 24 * 60 * 60 } });
}

function shuffle<T>(items: T[]) { const result = [...items]; for (let i = result.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [result[i], result[j]] = [result[j], result[i]]; } return result; }
async function refillPool(previous: DiscoverPool): Promise<DiscoverPool> {
  const sampled = await sampleMetronSeriesPages();
  const entries = new Map(previous.entries.map((entry) => [entry.id, entry]));
  for (const series of sampled) {
    const old = entries.get(series.id);
    entries.set(series.id, { id: series.id, title: series.series, publisher: series.publisher?.name ?? "Unknown publisher", checked: old?.checked ?? false, coverUrl: old?.coverUrl ?? null, yearBegan: series.year_began ?? old?.yearBegan ?? null, issueCount: series.issue_count ?? old?.issueCount ?? null });
  }
  const kept = shuffle([...entries.values()]).slice(0, POOL_SIZE);
  const ids = new Set(kept.map((entry) => entry.id));
  return { entries: kept, shownIds: previous.shownIds.filter((id) => ids.has(id)) };
}
async function updateRecommended(sets: RecommendationSets, manual: boolean, fetchCovers = false): Promise<RecommendationSets> {
  const day = localDate();
  const state = await cache<{ day: string; sequence: number }>(DAY_KEY);
  if (!manual && state?.day === day) return sets;
  const [pool, library, books, follows, dismissed, priorHistory] = await Promise.all([
    cache<DiscoverPool>(POOL_KEY), cache<KomgaSeries[]>("komga:series"), cache<KomgaBook[]>("komga:books"),
    db.select().from(followedSeries).where(eq(followedSeries.active, true)), dismissedIds(),
    cache<Record<string, { last_shown_at: string }>>(HISTORY_KEY),
  ]);
  if (!pool?.entries.length || !library) return sets;
  const now = new Date();
  const history = priorHistory ?? {};
  if (!state) for (const item of sets.recommended) history[String(item.id)] ??= { last_shown_at: now.toISOString() };
  const years = new Map<string, number>();
  for (const book of books ?? []) {
    const year = Number(book.metadata?.releaseDate?.slice(0, 4));
    if (year >= 1900 && year <= now.getFullYear() + 1) years.set(book.seriesId, Math.min(year, years.get(book.seriesId) ?? year));
  }
  const followedIds = new Set(follows.map((item) => item.komgaSeriesId));
  const seeds: RecommendationSeed[] = [
    ...library.map((item) => ({ id: `komga:${item.id}`, title: item.t, publisher: item.pub, year: years.get(item.id) ?? yearInTitle(item.t), genres: item.metadata?.genres, followed: followedIds.has(item.id) })),
    ...follows.map((item) => ({ id: `follow:${item.id}`, title: item.title, publisher: item.publisher ?? "Unknown publisher", year: years.get(item.komgaSeriesId) ?? yearInTitle(item.title), followed: true })),
  ];
  const excludedIds = new Set([...dismissed, ...follows.map((item) => item.metronSeriesId).filter((id): id is number => id !== null), ...sets.different.map((item) => item.id)]);
  const excludedTitles = new Set([...library.map((item) => normalizedTitle(item.t)), ...follows.map((item) => normalizedTitle(item.title)), ...sets.different.map((item) => normalizedTitle(item.title))]);
  const sequence = manual && state?.day === day ? state.sequence + 1 : 0;
  const rankingInput = {
    day,
    seeds,
    candidates: pool.entries.filter((item) => item.issueCount !== 0 && (!item.checked || item.coverUrl)).map((item) => ({ id: item.id, title: item.title, publisher: item.publisher, yearBegan: item.yearBegan ?? yearInTitle(item.title), coverUrl: item.coverUrl ?? "" })),
    excludedIds, excludedTitles,
    lastShownAt: Object.fromEntries(Object.entries(history).map(([id, item]) => [id, item.last_shown_at])),
    now, exclusionDays: env.RECOMMENDATION_EXCLUSION_DAYS, seedCount: env.RECOMMENDATION_SEED_COUNT,
  };
  let recommended: Recommendation[] = [];
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const picks = rankRecommendations({ ...rankingInput, sequence: sequence * 24 + attempt });
    if (picks.length > recommended.length) recommended = picks;
    if (recommended.length === 10) break;
  }
  if (fetchCovers) {
    const entries = new Map(pool.entries.map((entry) => [entry.id, entry]));
    let previews = 0;
    for (const item of recommended) {
      const entry = entries.get(item.id);
      if (!entry || entry.coverUrl || previews >= MAX_CANDIDATE_CHECKS) continue;
      previews += 1;
      try {
        entry.coverUrl = (await previewMetronIssues(item.id)).find((issue) => issue.image)?.image ?? null;
        entry.checked = true;
        item.coverUrl = entry.coverUrl ?? "";
      } catch { break; }
    }
    if (previews) await savePool(pool);
  }
  for (const item of recommended) history[String(item.id)] = { last_shown_at: now.toISOString() };
  const result = { recommended, different: sets.different };
  await save(result);
  await saveJson(HISTORY_KEY, history);
  await saveJson(DAY_KEY, { day, sequence });
  return result;
}

export type DiscoverScope = "recommended" | "different" | "all";
export async function refreshDiscover(scope: DiscoverScope = "all"): Promise<RecommendationSets> { const result = await runTrackedJob("refresh-discover", () => buildDiscover(scope)); if (!result) throw new Error("Discover refresh is already running"); return getRecommendations(); }
export async function initializeDiscover() {
  const state = await cache<{ day: string }>(DAY_KEY);
  if (!(await cache<RecommendationSets>(KEY))) await refreshDiscover();
  else if (state?.day !== localDate()) await refreshDiscover("recommended");
}
async function buildDiscover(scope: DiscoverScope): Promise<RecommendationSets> {
  const previous = (await cache<RecommendationSets>(KEY)) ?? { recommended: [], different: [] };
  if (scope === "recommended") return updateRecommended(previous, true, true);
  const deadline = Date.now() + MAX_REFRESH_MS;
  if (!env.METRON_USER || !env.METRON_PASSWORD) throw new Error("Metron is not configured");
  const [seriesCache, follows] = await Promise.all([cache<KomgaSeries[]>("komga:series"), db.select().from(followedSeries).where(eq(followedSeries.active, true))]);
  const library = seriesCache ?? [];
  if (!seriesCache) throw new Error("Komga has not synced yet");
  const [dismissed, excluded] = [new Set(await dismissedIds()), new Set([...library.map((item) => normalizedTitle(item.t)), ...follows.map((item) => normalizedTitle(item.title))])];
  const followedMetronIds = new Set(follows.map((item) => item.metronSeriesId).filter((id): id is number => id !== null));
  let candidateChecks = 0;
  const recommended: Recommendation[] = previous.recommended;
  const different: Recommendation[] = [];
  const publisherCounts = new Map<string, number>();
  {
    let pool = (await cache<DiscoverPool>(POOL_KEY)) ?? { entries: [], shownIds: [] };
    const current = new Set(previous.different.map((item) => item.id));
    const recommendedIds = new Set(recommended.map((item) => item.id));
    const usedTitles = new Set(recommended.map((item) => normalizedTitle(item.title)));
    const eligible = (entry: PoolEntry) => !dismissed.has(entry.id) && !followedMetronIds.has(entry.id) && !excluded.has(normalizedTitle(entry.title)) && !current.has(entry.id) && !recommendedIds.has(entry.id) && !usedTitles.has(normalizedTitle(entry.title)) && (!entry.checked || Boolean(entry.coverUrl));
    const available = pool.entries.filter((entry) => !pool.shownIds.includes(entry.id) && eligible(entry));
    if ((scope === "all" || available.length < 10) && Date.now() < deadline) {
      try { pool = await refillPool(pool); }
      catch (error) { if (!pool.entries.length) throw error; }
    }
    const shown = new Set(pool.shownIds);
    const fresh = pool.entries.filter((entry) => !shown.has(entry.id) && eligible(entry));
    const choices = [...shuffle(fresh.filter((entry) => entry.checked)), ...shuffle(fresh.filter((entry) => !entry.checked))];
    const recycled = shuffle(pool.entries.filter((entry) => shown.has(entry.id) && entry.checked && entry.coverUrl && eligible(entry)));
    for (const entry of [...choices, ...recycled]) {
      if (different.length >= 10 || Date.now() >= deadline) break;
      if ((publisherCounts.get(entry.publisher) ?? 0) >= 2 || usedTitles.has(normalizedTitle(entry.title))) continue;
      if (!entry.checked) {
        if (candidateChecks >= MAX_CANDIDATE_CHECKS) continue;
        candidateChecks += 1;
        const issues = await previewMetronIssues(entry.id);
        entry.coverUrl = issues.find((issue) => issue.image)?.image ?? null;
        entry.checked = true;
      }
      if (!entry.coverUrl) continue;
      different.push({ id: entry.id, title: entry.title, publisher: entry.publisher, reason: "Picked at random", coverUrl: entry.coverUrl });
      publisherCounts.set(entry.publisher, (publisherCounts.get(entry.publisher) ?? 0) + 1);
      usedTitles.add(normalizedTitle(entry.title));
      shown.add(entry.id);
    }
    pool.shownIds = [...shown];
    await savePool(pool);
  }
  for (const item of previous.different) {
    if (different.length >= 10) break;
    if (dismissed.has(item.id) || followedMetronIds.has(item.id) || excluded.has(normalizedTitle(item.title)) || recommended.some((candidate) => candidate.id === item.id) || different.some((candidate) => normalizedTitle(candidate.title) === normalizedTitle(item.title)) || (publisherCounts.get(item.publisher) ?? 0) >= 2) continue;
    different.push(item);
    publisherCounts.set(item.publisher, (publisherCounts.get(item.publisher) ?? 0) + 1);
  }
  const result = { recommended, different };
  await save(result);
  return scope === "all" ? updateRecommended(result, true, true) : result;
}


