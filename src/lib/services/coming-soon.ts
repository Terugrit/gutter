import { and, asc, eq, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dismissedSeries, followedSeries, interestFilters, interestWeights, issues, kvCache, releaseShelf, upcomingReleases, watches } from "@/db/schema";
import { env } from "@/env";
import { localDate } from "@/jobs/status";
import { sendRelease } from "@/jobs/refresh-releases";
import { followDiscoveredSeries, getMetronSeries, listMetronIssues, searchMetronSeries, searchUpcomingMetronIssues } from "./metron";

type InterestKind = "publisher" | "genre";
type Candidate = typeof upcomingReleases.$inferSelect;
type WeightRow = { kind: InterestKind; value: string; score: number };
const komgaSeriesSchema = z.array(z.object({
  pub: z.string().optional(),
  metadata: z.object({ genres: z.array(z.string()).optional() }).passthrough().optional(),
}).passthrough());

function normalized(value: string) { return value.trim().toLocaleLowerCase(); }
function seriesKey(value: Pick<Candidate, "metronSeriesId" | "comicvineSeriesId" | "seriesName">) {
  return value.metronSeriesId ? `metron:${value.metronSeriesId}` : value.comicvineSeriesId ? `comicvine:${value.comicvineSeriesId}` : `name:${normalized(value.seriesName)}`;
}
function addDays(day: string, amount: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function genres(row: Pick<Candidate, "genresJson">): string[] {
  try { return z.array(z.string()).parse(JSON.parse(row.genresJson)); } catch { return []; }
}
function kapowarrLink(volumeId: number | null) {
  return volumeId && env.KAPOWARR_URL ? `${env.KAPOWARR_URL.replace(/\/$/, "")}/volumes/${volumeId}` : null;
}

async function cacheValue(key: string): Promise<unknown> {
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, key)))[0];
  try { return row ? JSON.parse(row.valueJson) as unknown : null; } catch { return null; }
}

async function exclusions() {
  const [filters, dismissed] = await Promise.all([db.select().from(interestFilters), db.select().from(dismissedSeries)]);
  return {
    publishers: new Set(filters.filter((row) => row.kind === "publisher").map((row) => normalized(row.value))),
    genres: new Set(filters.filter((row) => row.kind === "genre").map((row) => normalized(row.value))),
    dismissed: new Set(dismissed.map((row) => row.seriesKey)),
  };
}

function excluded(candidate: Pick<Candidate, "metronSeriesId" | "comicvineSeriesId" | "seriesName" | "publisher" | "genresJson">, values: Awaited<ReturnType<typeof exclusions>>) {
  return values.dismissed.has(seriesKey(candidate)) || values.publishers.has(normalized(candidate.publisher)) || genres(candidate).some((genre) => values.genres.has(normalized(genre)));
}

export async function refreshUpcomingCandidates(now = new Date()) {
  if (!env.METRON_USER || !env.METRON_PASSWORD) return { imported: 0, pruned: 0 };
  const today = localDate(now);
  const start = addDays(today, 30);
  const end = addDays(today, 45);
  const [rows, blocked] = await Promise.all([
    searchUpcomingMetronIssues({ storeDateAfter: start, storeDateBefore: end, maxPages: 5 }),
    exclusions(),
  ]);
  const uniqueSeriesIds = [...new Set(rows.map((row) => row.series?.id).filter((id): id is number => Boolean(id)))];
  const details = new Map<number, Awaited<ReturnType<typeof getMetronSeries>>>();
  for (const id of uniqueSeriesIds.slice(0, 50)) details.set(id, await getMetronSeries(id));
  let imported = 0;
  const refreshedAt = now.toISOString();
  for (const issue of rows) {
    if (!issue.series || !issue.store_date) continue;
    const series = details.get(issue.series.id) ?? null;
    if (series?.language && series.language !== "en") continue;
    const candidate = {
      metronIssueId: issue.id,
      comicvineIssueId: null,
      metronSeriesId: issue.series.id,
      comicvineSeriesId: series?.cv_id ?? null,
      seriesName: series?.series ?? issue.series.name,
      issueNumber: issue.number,
      publisher: series?.publisher?.name ?? "Unknown publisher",
      genresJson: JSON.stringify(series?.genres?.map((genre) => genre.name) ?? []),
      coverUrl: issue.image ?? null,
      expectedReleaseDate: issue.store_date,
      releaseConfidence: "solicited" as const,
      isWildcard: false,
      source: "metron" as const,
      lastRefreshedAt: refreshedAt,
    };
    if (excluded(candidate, blocked)) continue;
    await db.insert(upcomingReleases).values(candidate).onConflictDoUpdate({
      target: upcomingReleases.metronIssueId,
      set: candidate,
    });
    imported += 1;
  }

  const seriesWatches = await db.select({ release: upcomingReleases, watch: watches }).from(watches).innerJoin(upcomingReleases, eq(watches.upcomingReleaseId, upcomingReleases.id)).where(and(eq(watches.scope, "series"), eq(watches.outcome, "pending")));
  for (const { release, watch } of seriesWatches) {
    if (!release.metronSeriesId && !release.comicvineSeriesId) continue;
    const matches = await db.select().from(upcomingReleases).where(release.metronSeriesId ? eq(upcomingReleases.metronSeriesId, release.metronSeriesId) : eq(upcomingReleases.comicvineSeriesId, release.comicvineSeriesId!));
    for (const match of matches) await db.insert(watches).values({ upcomingReleaseId: match.id, status: "watching", scope: "series", outcome: "pending", createdAt: watch.createdAt }).onConflictDoNothing({ target: watches.upcomingReleaseId });
  }

  const all = await db.select().from(upcomingReleases);
  const watched = new Set((await db.select({ id: watches.upcomingReleaseId }).from(watches)).map((row) => row.id));
  const stale = all.filter((row) => row.expectedReleaseDate < today && !watched.has(row.id)).map((row) => row.id);
  if (stale.length) await db.delete(upcomingReleases).where(inArray(upcomingReleases.id, stale));
  return { imported, pruned: stale.length };
}

async function interestSignals() {
  const [cached, follows, weightRows] = await Promise.all([
    cacheValue("komga:series"),
    db.select().from(followedSeries).where(eq(followedSeries.active, true)),
    db.select().from(interestWeights),
  ]);
  const library = komgaSeriesSchema.safeParse(cached).data ?? [];
  const publishers = new Map<string, number>();
  const genreCounts = new Map<string, number>();
  const bump = (map: Map<string, number>, value?: string | null) => { if (value) map.set(normalized(value), (map.get(normalized(value)) ?? 0) + 1); };
  for (const item of library) {
    bump(publishers, item.pub);
    for (const genre of item.metadata?.genres ?? []) bump(genreCounts, genre);
  }
  for (const follow of follows) bump(publishers, follow.publisher);
  const weights = new Map(weightRows.map((row) => [`${row.kind}:${normalized(row.value)}`, row.score]));
  return { publishers, genres: genreCounts, weights };
}

function weightedPick<T extends { score: number }>(items: T[], random: () => number): T | undefined {
  const total = items.reduce((sum, item) => sum + Math.max(1, item.score), 0);
  let cursor = random() * total;
  for (const item of items) { cursor -= Math.max(1, item.score); if (cursor <= 0) return item; }
  return items.at(-1);
}

export async function getComingSoon(limit = 6, random: () => number = process.env.GUTTER_VISUAL_TEST === "1" ? () => 0.25 : Math.random) {
  const [rows, blocked, signals, watched] = await Promise.all([
    db.select().from(upcomingReleases).orderBy(asc(upcomingReleases.expectedReleaseDate)),
    exclusions(), interestSignals(), db.select().from(watches),
  ]);
  const watchByRelease = new Map(watched.filter((row) => row.outcome === "pending").map((row) => [row.upcomingReleaseId, row]));
  const today = localDate();
  const scored = rows.filter((row) => row.expectedReleaseDate >= today && !excluded(row, blocked)).map((row) => {
    const publisher = normalized(row.publisher);
    let score = (signals.publishers.get(publisher) ?? 0) * (signals.weights.get(`publisher:${publisher}`) ?? 100);
    for (const genre of genres(row)) {
      const key = normalized(genre);
      score += (signals.genres.get(key) ?? 0) * (signals.weights.get(`genre:${key}`) ?? 100);
    }
    return { row, score };
  });
  const normal = scored.filter((item) => item.score > 0);
  const outside = scored.filter((item) => item.score === 0);
  const selected: Array<{ row: Candidate; score: number; wildcard: boolean }> = [];
  while (normal.length && selected.length < Math.max(0, limit - (outside.length ? 1 : 0))) {
    const item = weightedPick(normal, random)!;
    selected.push({ ...item, wildcard: false });
    normal.splice(normal.indexOf(item), 1);
  }
  if (outside.length && selected.length < limit) {
    const item = outside[Math.floor(random() * outside.length)];
    selected.push({ ...item, wildcard: true });
    outside.splice(outside.indexOf(item), 1);
  }
  for (const item of [...normal, ...outside].sort(() => random() - .5)) if (selected.length < limit) selected.push({ ...item, wildcard: false });
  return selected.map(({ row, wildcard }) => ({
    id: row.id, metronSeriesId: row.metronSeriesId, comicvineSeriesId: row.comicvineSeriesId,
    seriesName: row.seriesName, issueNumber: row.issueNumber, publisher: row.publisher, genres: genres(row),
    coverUrl: row.coverUrl, expectedReleaseDate: row.expectedReleaseDate, releaseConfidence: row.releaseConfidence,
    source: row.source, isWildcard: wildcard, watch: watchByRelease.get(row.id) ?? null,
  }));
}

export async function watchUpcomingRelease(id: number, scope: "issue" | "series") {
  const release = (await db.select().from(upcomingReleases).where(eq(upcomingReleases.id, id)))[0];
  if (!release) return null;
  if (release.metronSeriesId) await followDiscoveredSeries(release.metronSeriesId);
  const old = (await db.select().from(watches).where(eq(watches.upcomingReleaseId, id)))[0];
  if (old) {
    await db.update(watches).set({ scope, status: "watching", outcome: "pending", notifiedAt: null }).where(eq(watches.id, old.id));
    return { ...old, scope, status: "watching" as const, outcome: "pending" as const };
  }
  return (await db.insert(watches).values({ upcomingReleaseId: id, status: "watching", scope, outcome: "pending", createdAt: new Date().toISOString() }).returning())[0];
}

export async function unwatchUpcomingRelease(id: number) {
  await db.update(watches).set({ outcome: "expired" }).where(eq(watches.id, id));
}

export async function dismissUpcomingSeries(input: { metronSeriesId?: number; comicvineSeriesId?: number }) {
  const rows = input.metronSeriesId
    ? await db.select().from(upcomingReleases).where(eq(upcomingReleases.metronSeriesId, input.metronSeriesId))
    : input.comicvineSeriesId ? await db.select().from(upcomingReleases).where(eq(upcomingReleases.comicvineSeriesId, input.comicvineSeriesId)) : [];
  if (!rows.length) return false;
  const release = rows[0];
  const key = seriesKey(release);
  await db.insert(dismissedSeries).values({ seriesKey: key, metronSeriesId: release.metronSeriesId, comicvineSeriesId: release.comicvineSeriesId, seriesName: release.seriesName, dismissedAt: new Date().toISOString() }).onConflictDoNothing({ target: dismissedSeries.seriesKey });
  const ids = rows.map((row) => row.id);
  if (ids.length) await db.update(watches).set({ outcome: "expired" }).where(inArray(watches.upcomingReleaseId, ids));
  const watched = new Set((await db.select({ id: watches.upcomingReleaseId }).from(watches).where(inArray(watches.upcomingReleaseId, ids))).map((row) => row.id));
  const removable = ids.filter((id) => !watched.has(id));
  if (removable.length) await db.delete(upcomingReleases).where(inArray(upcomingReleases.id, removable));
  return true;
}

export async function getInterestFilters() { return db.select().from(interestFilters).orderBy(asc(interestFilters.kind), asc(interestFilters.value)); }
export async function addInterestFilter(kind: InterestKind, value: string) {
  const clean = value.trim();
  if (!clean) return null;
  const existing = (await getInterestFilters()).find((row) => row.kind === kind && normalized(row.value) === normalized(clean));
  if (existing) return existing;
  return (await db.insert(interestFilters).values({ kind, value: clean, mode: "exclude" }).returning())[0];
}
export async function removeInterestFilter(id: number) { await db.delete(interestFilters).where(eq(interestFilters.id, id)); }

export async function searchUpcomingSeries(query: string) {
  return (await searchMetronSeries({ name: query, maxPages: 2 })).slice(0, 12).map((series) => ({
    id: series.id, title: series.series, publisher: series.publisher?.name ?? "Unknown publisher", yearBegan: series.year_began ?? null,
  }));
}

export async function addManualUpcomingRelease(metronSeriesId: number) {
  const [series, seriesIssues] = await Promise.all([getMetronSeries(metronSeriesId), listMetronIssues(metronSeriesId)]);
  if (!series) return null;
  const today = localDate();
  const issue = seriesIssues.filter((item) => item.store_date && item.store_date >= today).sort((a, b) => a.store_date!.localeCompare(b.store_date!))[0];
  if (!issue?.store_date) return null;
  const values = {
    metronIssueId: issue.id, metronSeriesId, comicvineSeriesId: series.cv_id ?? null,
    seriesName: series.series, issueNumber: issue.number, publisher: series.publisher?.name ?? "Unknown publisher",
    genresJson: JSON.stringify(series.genres?.map((genre) => genre.name) ?? []), coverUrl: issue.image ?? null,
    expectedReleaseDate: issue.store_date, releaseConfidence: "solicited" as const, isWildcard: false,
    source: "manual" as const, lastRefreshedAt: new Date().toISOString(),
  };
  await db.insert(upcomingReleases).values(values).onConflictDoUpdate({ target: upcomingReleases.metronIssueId, set: values });
  return (await db.select().from(upcomingReleases).where(eq(upcomingReleases.metronIssueId, issue.id)))[0];
}

export async function checkReleaseDates(now = new Date()) {
  const due = await db.select({ watch: watches, release: upcomingReleases }).from(watches).innerJoin(upcomingReleases, eq(watches.upcomingReleaseId, upcomingReleases.id)).where(and(eq(watches.status, "watching"), eq(watches.outcome, "pending"), lte(upcomingReleases.expectedReleaseDate, localDate(now))));
  let released = 0;
  for (const row of due) {
    const follow = row.release.metronSeriesId ? (await db.select().from(followedSeries).where(eq(followedSeries.metronSeriesId, row.release.metronSeriesId)))[0] : null;
    await db.insert(releaseShelf).values({ watchId: row.watch.id, seriesName: row.release.seriesName, issueNumber: row.release.issueNumber, coverUrl: row.release.coverUrl, kapowarrLink: kapowarrLink(follow?.kapowarrVolumeId ?? null), status: "pending", addedAt: now.toISOString() }).onConflictDoNothing({ target: releaseShelf.watchId });
    await db.update(watches).set({ status: "released" }).where(eq(watches.id, row.watch.id));
    const issue = row.release.metronIssueId ? (await db.select().from(issues).where(eq(issues.metronIssueId, row.release.metronIssueId)))[0] : null;
    const sent = issue ? await sendRelease({ issueId: issue.id, seriesTitle: row.release.seriesName, number: row.release.issueNumber, issueTitle: issue.title, storeDate: row.release.expectedReleaseDate, coverUrl: row.release.coverUrl }) : false;
    if (sent) await db.update(watches).set({ status: "notified", notifiedAt: now.toISOString() }).where(eq(watches.id, row.watch.id));
    released += 1;
  }
  return released;
}

export async function getReleaseShelf(now = new Date()) {
  const rows = await db.select({ shelf: releaseShelf, watch: watches, release: upcomingReleases }).from(releaseShelf).leftJoin(watches, eq(releaseShelf.watchId, watches.id)).leftJoin(upcomingReleases, eq(watches.upcomingReleaseId, upcomingReleases.id)).where(isNull(releaseShelf.removedAt)).orderBy(asc(releaseShelf.addedAt));
  return rows.map(({ shelf, release }) => {
    const date = new Date(shelf.addedAt);
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    return { ...shelf, expectedReleaseDate: release?.expectedReleaseDate ?? null, week: monday.toISOString().slice(0, 10), stale: now.getTime() - date.getTime() >= 7 * 86400000 };
  });
}

export async function removeReleaseShelfItem(id: number) {
  const row = (await db.select().from(releaseShelf).where(eq(releaseShelf.id, id)))[0];
  if (!row) return;
  await db.update(releaseShelf).set({ removedAt: new Date().toISOString() }).where(eq(releaseShelf.id, id));
  if (row.watchId) await db.update(watches).set({ outcome: "expired" }).where(eq(watches.id, row.watchId));
}

export async function updateReleaseShelfForKapowarr(followId: number, previous: { state: string; filesHave: number } | null, current: { state: string; filesHave: number }) {
  const follow = (await db.select().from(followedSeries).where(eq(followedSeries.id, followId)))[0];
  if (!follow?.metronSeriesId) return 0;
  const active = await db.select({ shelf: releaseShelf, watch: watches }).from(releaseShelf).innerJoin(watches, eq(releaseShelf.watchId, watches.id)).innerJoin(upcomingReleases, and(eq(watches.upcomingReleaseId, upcomingReleases.id), eq(upcomingReleases.metronSeriesId, follow.metronSeriesId))).where(isNull(releaseShelf.removedAt));
  if (!active.length) return 0;
  if (current.state === "downloading") for (const row of active) await db.update(releaseShelf).set({ status: "downloading", kapowarrLink: kapowarrLink(follow.kapowarrVolumeId) }).where(eq(releaseShelf.id, row.shelf.id));
  const completed = current.state === "files-ready" && (!previous || previous.state !== "files-ready" || current.filesHave > previous.filesHave);
  if (!completed) return 0;
  const finishedAt = new Date().toISOString();
  for (const row of active) {
    await db.update(releaseShelf).set({ status: "downloaded", removedAt: finishedAt, kapowarrLink: kapowarrLink(follow.kapowarrVolumeId) }).where(eq(releaseShelf.id, row.shelf.id));
    await db.update(watches).set({ outcome: "downloaded" }).where(eq(watches.id, row.watch.id));
  }
  return active.length;
}

export async function tuneInterestWeights() {
  const finished = await db.select({ watch: watches, release: upcomingReleases }).from(watches).innerJoin(upcomingReleases, eq(watches.upcomingReleaseId, upcomingReleases.id)).where(inArray(watches.outcome, ["downloaded", "expired"]));
  const totals = new Map<string, { kind: InterestKind; value: string; downloaded: number; total: number }>();
  for (const { watch, release } of finished) {
    const values: Array<[InterestKind, string]> = [["publisher", release.publisher], ...genres(release).map((genre) => ["genre", genre] as [InterestKind, string])];
    for (const [kind, value] of values) {
      const key = `${kind}:${normalized(value)}`;
      const item = totals.get(key) ?? { kind, value, downloaded: 0, total: 0 };
      item.total += 1; if (watch.outcome === "downloaded") item.downloaded += 1; totals.set(key, item);
    }
  }
  for (const item of totals.values()) {
    const score = Math.max(50, Math.min(150, 75 + Math.round(item.downloaded / item.total * 50)));
    await db.insert(interestWeights).values({ kind: item.kind, value: item.value, score }).onConflictDoUpdate({ target: [interestWeights.kind, interestWeights.value], set: { score } });
  }
  return totals.size;
}
