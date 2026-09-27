import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { followedSeries, kvCache, readingShelf } from "@/db/schema";
import { recommendationSetsSchema } from "./recommendations";
import { followDiscoveredSeries } from "./metron";
import { sendSeriesToKapowarr } from "./kapowarr";

const poolSchema = z.object({ entries: z.array(z.object({
  id: z.number().int().positive(), title: z.string(), publisher: z.string(),
  yearBegan: z.number().int().nullable().optional(), coverUrl: z.string().nullable().optional(),
}).passthrough()) }).passthrough();

async function cachedJson(key: string): Promise<unknown> {
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, key)))[0];
  if (!row) return null;
  try { return JSON.parse(row.valueJson) as unknown; } catch { return null; }
}

export async function getSavedShelfIds(): Promise<number[]> {
  return (await db.select({ id: readingShelf.metronSeriesId }).from(readingShelf)).map((row) => row.id);
}

export async function getReadingShelf() {
  const saved = await db.select().from(readingShelf).orderBy(desc(readingShelf.savedAt), desc(readingShelf.id));
  if (!saved.length) return [];
  const follows = await db.select().from(followedSeries).where(inArray(followedSeries.metronSeriesId, saved.map((item) => item.metronSeriesId)));
  const byMetronId = new Map<number, typeof follows[number]>();
  for (const follow of follows) if (follow.metronSeriesId !== null && (!byMetronId.has(follow.metronSeriesId) || follow.active)) byMetronId.set(follow.metronSeriesId, follow);
  return saved.map((item) => ({
    id: item.metronSeriesId, title: item.title, publisher: item.publisher,
    yearBegan: item.yearBegan, coverUrl: item.coverUrl, savedAt: item.savedAt,
    followed: byMetronId.get(item.metronSeriesId)?.active ?? false,
    sent: Boolean(byMetronId.get(item.metronSeriesId)?.kapowarrVolumeId),
  }));
}

export async function saveToReadingShelf(id: number) {
  const existing = (await db.select().from(readingShelf).where(eq(readingShelf.metronSeriesId, id)))[0];
  if (existing) return existing;
  const [setsResult, poolResult] = await Promise.all([cachedJson("discover:recommendations"), cachedJson("discover:pool")]);
  const sets = recommendationSetsSchema.safeParse(setsResult);
  const pool = poolSchema.safeParse(poolResult);
  const recommendation = sets.success ? [...sets.data.recommended, ...sets.data.different].find((item) => item.id === id) : undefined;
  const candidate = pool.success ? pool.data.entries.find((item) => item.id === id) : undefined;
  if (!recommendation && !candidate) return null;
  const title = recommendation?.title ?? candidate!.title;
  const publisher = recommendation?.publisher ?? candidate!.publisher;
  const yearBegan = candidate ? candidate.yearBegan ?? null : recommendation?.yearBegan ?? null;
  const coverUrl = recommendation?.coverUrl || candidate?.coverUrl || null;
  await db.insert(readingShelf).values({ metronSeriesId: id, title, publisher, yearBegan, coverUrl, savedAt: new Date().toISOString() }).onConflictDoNothing({ target: readingShelf.metronSeriesId });
  return (await db.select().from(readingShelf).where(eq(readingShelf.metronSeriesId, id)))[0];
}

export async function removeFromReadingShelf(id: number) {
  await db.delete(readingShelf).where(eq(readingShelf.metronSeriesId, id));
}

export async function sendShelfSeriesToKapowarr(id: number) {
  const saved = (await db.select().from(readingShelf).where(eq(readingShelf.metronSeriesId, id)))[0];
  if (!saved) return null;
  const follow = await followDiscoveredSeries(id);
  return sendSeriesToKapowarr(follow.komgaSeriesId);
}
