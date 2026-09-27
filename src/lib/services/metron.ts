import { and, eq, inArray, or } from "drizzle-orm";
import { MetronClient, type IssueSearch, type SeriesSearch } from "@/clients/metron/client";
import type { MetronCreator, MetronIssue, MetronSeries } from "@/clients/metron/schemas";
import { ComicVineClient } from "@/clients/comicvine/client";
import { db } from "@/db";
import { followedSeries, issues, kvCache } from "@/db/schema";
import { env } from "@/env";
import { enqueueRateLimited } from "@/lib/rate-limit-queue";
import { matchSearchTitle, rankMetronCandidates } from "@/lib/matching/metron";
import { applyKomgaOwnership } from "@/lib/services/library";

import { normalizeSeriesStatus } from "./series-progress";

import { applyImportedSkips } from "./import-skips";

type CachedKomgaSeries = { id: string; t: string; pub: string; seed: number; thumbnail?: string; metadata?: Record<string, unknown> };
type MatchCandidate = MetronSeries & { score?: number };
const SEARCH_TTL_SECONDS = 60 * 60 * 6;
const ISSUE_TTL_SECONDS = 60 * 60 * 24;
const COMICVINE_TTL_SECONDS = 60 * 60 * 24;

function cacheKey(prefix: string, value: unknown) { return `${prefix}:${JSON.stringify(value)}`; }
async function cached<T>(key: string): Promise<T | null> {
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, key)))[0];
  if (!row || new Date(row.fetchedAt).getTime() + row.ttlSeconds * 1000 < Date.now()) return null;
  try { return JSON.parse(row.valueJson) as T; } catch { return null; }
}
async function saveCache(key: string, value: unknown, ttlSeconds: number) {
  const now = new Date().toISOString();
  await db.insert(kvCache).values({ key, valueJson: JSON.stringify(value), fetchedAt: now, ttlSeconds }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(value), fetchedAt: now, ttlSeconds } });
}
function client() {
  if (!env.METRON_USER || !env.METRON_PASSWORD) return null;
  return new MetronClient({ username: env.METRON_USER, password: env.METRON_PASSWORD });
}
function comicVineClient() { return env.COMICVINE_API_KEY ? new ComicVineClient({ apiKey: env.COMICVINE_API_KEY }) : null; }
function normalise(value: string) { return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""); }
// ComicInfo.xml's Web tag is imported per book. Tagged issues use 4000-, volumes use 4050-.
// Scan metadata rather than depending on an undocumented Komga field path.
const COMICVINE_URL_PATTERN = /comicvine\.gamespot\.com\/[^"'\s]*?\/(\d{2,5})-(\d+)\/?/;
const COMICVINE_ISSUE_PREFIX = "4000";
const COMICVINE_VOLUME_PREFIX = "4050";
function findComicVineUrl(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string") return COMICVINE_URL_PATTERN.test(value) ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) { const found = findComicVineUrl(item, depth + 1); if (found) return found; }
    return null;
  }
  if (typeof value === "object") {
    for (const item of Object.values(value as Record<string, unknown>)) { const found = findComicVineUrl(item, depth + 1); if (found) return found; }
  }
  return null;
}
async function resolveKomgaEmbeddedComicVineId(komgaSeriesId: string): Promise<number | null> {
  const key = cacheKey("komga:cvlink", komgaSeriesId);
  const hit = await cached<number>(key);
  if (hit !== null) return hit || null;
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, "komga:books")))[0];
  let books: { seriesId: string; metadata?: Record<string, unknown> }[] = [];
  if (row) { try { books = JSON.parse(row.valueJson); } catch { books = []; } }
  let resolved: number | null = null;
  for (const book of books) {
    if (book.seriesId !== komgaSeriesId) continue;
    const url = findComicVineUrl(book.metadata);
    const match = url?.match(COMICVINE_URL_PATTERN);
    if (!match) continue;
    const [, prefix, id] = match;
    if (prefix === COMICVINE_VOLUME_PREFIX) { resolved = Number(id); break; }
    if (prefix === COMICVINE_ISSUE_PREFIX) {
      const cv = comicVineClient();
      if (!cv) continue;
      const volumeId = await enqueueRateLimited(() => cv.getIssueVolumeId(Number(id)));
      if (volumeId) { resolved = volumeId; break; }
    }
  }
  await saveCache(key, resolved ?? 0, COMICVINE_TTL_SECONDS);
  return resolved;
}
async function resolveComicVineId(series: MetronSeries): Promise<number | null> {
  if (series.cv_id) return series.cv_id;
  const key = cacheKey("comicvine:volume", { title: series.series, publisher: series.publisher?.name, year: series.year_began });
  const hit = await cached<number>(key);
  if (hit !== null) return hit || null;
  const client = comicVineClient();
  if (!client) return null;
  const candidates = await enqueueRateLimited(() => client.searchVolumes(series.series));
  const title = normalise(series.series);
  const publisher = series.publisher?.name ? normalise(series.publisher.name) : null;
  const selected = candidates.find((candidate) => normalise(candidate.name) === title && (!series.year_began || candidate.start_year === String(series.year_began)) && (!publisher || !candidate.publisher?.name || normalise(candidate.publisher.name) === publisher)) ?? candidates.find((candidate) => normalise(candidate.name) === title) ?? null;
  await saveCache(key, selected?.id ?? 0, COMICVINE_TTL_SECONDS);
  return selected?.id ?? null;
}
export async function searchMetronSeries(search: SeriesSearch): Promise<MetronSeries[]> {
  const key = cacheKey("metron:series", search);
  const hit = await cached<MetronSeries[]>(key);
  if (hit) return hit;
  const metron = client();
  if (!metron) return [];
  const result = await metron.searchSeries(search);
  await saveCache(key, result, SEARCH_TTL_SECONDS);
  return result;
}
export async function sampleMetronSeriesPages(): Promise<MetronSeries[]> {
  const metron = client();
  return metron ? metron.sampleSeriesPages(5) : [];
}
export async function searchMetronCreators(name: string): Promise<MetronCreator[]> {
  const key = cacheKey("metron:creators", name);
  const hit = await cached<MetronCreator[]>(key);
  if (hit) return hit;
  const metron = client(); if (!metron) return [];
  const result = await metron.searchCreators(name);
  await saveCache(key, result, SEARCH_TTL_SECONDS);
  return result;
}
export async function getMetronIssue(id: number): Promise<MetronIssue | null> {
  const key = `metron:issue:${id}`;
  const hit = await cached<MetronIssue>(key);
  if (hit) return hit;
  const metron = client(); if (!metron) return null;
  const result = await metron.getIssue(id);
  await saveCache(key, result, ISSUE_TTL_SECONDS);
  return result;
}
export async function getMetronSeries(id: number, force = false): Promise<MetronSeries | null> {
  const key = `metron:series:${id}`;
  const hit = await cached<MetronSeries>(key);
  if (hit && !force) return hit;
  const metron = client();
  if (!metron) return null;
  const result = await metron.getSeries(id);
  await saveCache(key, result, SEARCH_TTL_SECONDS);
  return result;
}
export async function searchUpcomingMetronIssues(search: IssueSearch): Promise<MetronIssue[]> {
  const metron = client();
  if (!metron) return [];
  return metron.searchIssues(search);
}
function numericMetadata(metadata: Record<string, unknown> | undefined, keys: string[]): number | null {
  if (!metadata) return null;
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  }
  return null;
}
export async function candidatesForSeries(input: { title: string; publisher?: string | null; year?: number | null; metadata?: Record<string, unknown> }): Promise<MatchCandidate[]> {
  const metronId = numericMetadata(input.metadata, ["metronId", "metron_id"]);
  if (metronId) {
    const exact = await getMetronSeries(metronId);
    return exact ? [{ ...exact, score: 100 }] : [];
  }
  const comicVineId = numericMetadata(input.metadata, ["comicvineId", "comicVineId", "comic_vine_id", "cvId", "cv_id"]);
  const title = matchSearchTitle(input.title);
  const candidates = comicVineId
    ? await searchMetronSeries({ comicVineId })
    : await searchMetronSeries({ name: title, publisher: input.publisher ?? undefined });
  return comicVineId ? candidates.map((candidate) => ({ ...candidate, score: 100 })) : rankMetronCandidates(candidates, { ...input, title });
}
async function sourceForFollow(komgaSeriesId: string) {
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, "komga:series")))[0];
  if (!row) return null;
  try { return (JSON.parse(row.valueJson) as CachedKomgaSeries[]).find((item) => item.id === komgaSeriesId) ?? null; } catch { return null; }
}
function yearFromMetadata(metadata?: Record<string, unknown>) {
  const value = metadata?.year ?? metadata?.yearBegan ?? metadata?.year_began;
  return typeof value === "number" && Number.isInteger(value) ? value : typeof value === "string" && /^\d{4}$/.test(value) ? Number(value) : null;
}
export async function cacheIssues(followedSeriesId: number, metronSeriesId: number, force = false, includeDetails = true) {
  const key = `metron:issues:${metronSeriesId}`;
  let result = await cached<MetronIssue[]>(key);
  if (!result || force) {
    const metron = client();
    if (!metron) return;
    result = await metron.listIssues(metronSeriesId);
    await saveCache(key, result, ISSUE_TTL_SECONDS);
  }
  const metadata = await getMetronSeries(metronSeriesId, force);
  await db.update(followedSeries).set({ seriesStatus: normalizeSeriesStatus(metadata?.status) }).where(eq(followedSeries.id, followedSeriesId));
  const now = new Date().toISOString();
  const follow = (await db.select({ createdAt: followedSeries.createdAt, monitorMode: followedSeries.monitorMode }).from(followedSeries).where(eq(followedSeries.id, followedSeriesId)))[0];
  const existingByMetronId = new Map<number, { followedSeriesId: number; description: string | null; creditsJson: string | null; storeDate: string | null; owned: boolean }>();
  // SQLite has a finite number of bind parameters. Chunking keeps large, long-running
  // series safe while replacing one lookup per issue with a few indexed lookups.
  for (let start = 0; start < result.length; start += 900) {
    const ids = result.slice(start, start + 900).map((issue) => issue.id);
    const existing = await db.select({ metronIssueId: issues.metronIssueId, followedSeriesId: issues.followedSeriesId, description: issues.description, creditsJson: issues.creditsJson, storeDate: issues.storeDate, owned: issues.owned }).from(issues).where(inArray(issues.metronIssueId, ids));
    for (const issue of existing) existingByMetronId.set(issue.metronIssueId, issue);
  }
  const writes: Array<{ metronIssueId: number; followedSeriesId: number; number: string; title: string | null; storeDate: string | null; coverUrl: string | null; description: string | null; creditsJson: string | null; active: true; updatedAt: string; previousDate?: string; dateChangedAt?: number }> = [];
  for (const listedIssue of result) {
    const existing = existingByMetronId.get(listedIssue.id);
    if (existing && existing.followedSeriesId !== followedSeriesId) continue;
    const relevant = follow?.monitorMode === "all" || !listedIssue.store_date || listedIssue.store_date >= (follow?.createdAt.slice(0, 10) ?? "");
    const detail = includeDetails && relevant && (!existing?.description || !existing.creditsJson) ? await getMetronIssue(listedIssue.id) : null;
    const issue = detail ?? listedIssue;
    // The freshly fetched issue list owns the date; a cached detail may still carry yesterday's value.
    const nextDate = listedIssue.store_date !== undefined ? listedIssue.store_date : detail?.store_date ?? null;
    const moved = existing && !existing.owned && existing.storeDate && nextDate && existing.storeDate !== nextDate;
    const dateChange = moved ? { previousDate: existing.storeDate!, dateChangedAt: Date.now() } : {};
    writes.push({ metronIssueId: issue.id, followedSeriesId, number: issue.number, title: issue.issue ?? null, storeDate: nextDate, coverUrl: issue.image ?? null, description: issue.desc ?? existing?.description ?? null, creditsJson: issue.credits ? JSON.stringify(issue.credits) : existing?.creditsJson ?? null, active: true, updatedAt: now, ...dateChange });
  }
  db.transaction((tx) => {
    for (const issue of writes) {
      const { previousDate, dateChangedAt } = issue;
      const dateChange = previousDate ? { previousDate, dateChangedAt } : {};
      tx.insert(issues).values(issue).onConflictDoUpdate({ target: issues.metronIssueId, set: { number: issue.number, title: issue.title, storeDate: issue.storeDate, coverUrl: issue.coverUrl, description: issue.description, creditsJson: issue.creditsJson, active: true, updatedAt: now, ...dateChange } }).run();
    }
  });
  applyImportedSkips(followedSeriesId);
  return true;
}
export async function listMetronIssues(metronSeriesId: number): Promise<MetronIssue[]> {
  const key = `metron:issues:${metronSeriesId}`;
  const hit = await cached<MetronIssue[]>(key);
  if (hit) return hit;
  const metron = client();
  if (!metron) return [];
  const result = await metron.listIssues(metronSeriesId);
  await saveCache(key, result, ISSUE_TTL_SECONDS);
  return result;
}
export async function previewMetronIssues(metronSeriesId: number): Promise<MetronIssue[]> {
  const full = await cached<MetronIssue[]>(`metron:issues:${metronSeriesId}`);
  if (full) return full;
  const key = `metron:issue-preview:${metronSeriesId}`;
  const preview = await cached<MetronIssue[]>(key);
  if (preview) return preview;
  const metron = client();
  if (!metron) return [];
  const result = await metron.listIssues(metronSeriesId, 1);
  await saveCache(key, result, ISSUE_TTL_SECONDS);
  return result;
}
export async function refreshFollowedIssues() {
  const follows = await db.select().from(followedSeries).where(and(eq(followedSeries.active, true), inArray(followedSeries.matchStatus, ["auto", "confirmed"])));
  for (const follow of follows) if (follow.metronSeriesId) await cacheIssues(follow.id, follow.metronSeriesId, true);
  await applyKomgaOwnership();
}
export async function autoMatchFollowedSeries(komgaSeriesId: string) {
  const follow = (await db.select().from(followedSeries).where(eq(followedSeries.komgaSeriesId, komgaSeriesId)))[0];
  if (!follow) return null;
  const source = await sourceForFollow(komgaSeriesId);
  const embeddedComicVineId = await resolveKomgaEmbeddedComicVineId(komgaSeriesId);
  const metadata = embeddedComicVineId ? { ...source?.metadata, comicvineId: embeddedComicVineId } : source?.metadata;
  const candidates = await candidatesForSeries({ title: follow.title, publisher: follow.publisher, year: yearFromMetadata(source?.metadata), metadata });
  const best = candidates[0];
  if (!best || (best.score ?? 0) < 90) {
    await db.update(issues).set({ active: false }).where(eq(issues.followedSeriesId, follow.id));
    await db.update(followedSeries).set({ matchStatus: "unmatched", seriesStatus: null, metronSeriesId: null, comicvineVolumeId: null }).where(eq(followedSeries.id, follow.id));
    return { status: "unmatched" as const, candidates };
  }
  if (follow.metronSeriesId !== best.id) await db.update(issues).set({ active: false }).where(eq(issues.followedSeriesId, follow.id));
  await db.update(followedSeries).set({ matchStatus: "auto", seriesStatus: null, metronSeriesId: best.id, comicvineVolumeId: await resolveComicVineId(best) }).where(eq(followedSeries.id, follow.id));
  await cacheIssues(follow.id, best.id);
  await applyKomgaOwnership();
  return { status: "auto" as const, candidate: best, candidates };
}
export async function confirmMatch(komgaSeriesId: string, metronSeriesId: number) {
  const follow = (await db.select().from(followedSeries).where(eq(followedSeries.komgaSeriesId, komgaSeriesId)))[0];
  if (!follow) throw new Error("Followed series not found");
  const selected = await getMetronSeries(metronSeriesId);
  if (!selected) throw new Error("Metron series not found");
  if (follow.metronSeriesId !== selected.id) await db.update(issues).set({ active: false }).where(eq(issues.followedSeriesId, follow.id));
  await db.update(followedSeries).set({ matchStatus: "confirmed", seriesStatus: null, metronSeriesId: selected.id, comicvineVolumeId: await resolveComicVineId(selected) }).where(and(eq(followedSeries.id, follow.id), eq(followedSeries.komgaSeriesId, komgaSeriesId)));
  // List data is enough to show issues immediately; the scheduled release refresh hydrates details.
  await cacheIssues(follow.id, selected.id, false, false);
  await applyKomgaOwnership();
  return selected;
}
export async function followDiscoveredSeries(metronSeriesId: number) {
  const existing = (await db.select().from(followedSeries).where(or(eq(followedSeries.metronSeriesId, metronSeriesId), eq(followedSeries.komgaSeriesId, `discover:${metronSeriesId}`))))[0];
  if (existing) { if (!existing.active) await db.update(followedSeries).set({ active: true }).where(eq(followedSeries.id, existing.id)); return { ...existing, active: true }; }
  const selected = await getMetronSeries(metronSeriesId);
  if (!selected) throw new Error("Metron series not found");
  const inserted = await db.insert(followedSeries).values({ komgaSeriesId: `discover:${selected.id}`, title: selected.series, publisher: selected.publisher?.name ?? null, metronSeriesId: selected.id, comicvineVolumeId: await resolveComicVineId(selected), matchStatus: "confirmed" }).returning();
  await cacheIssues(inserted[0].id, selected.id);
  await applyKomgaOwnership();
  return inserted[0];
}
