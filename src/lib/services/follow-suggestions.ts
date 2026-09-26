import { eq } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries, kvCache } from "@/db/schema";
import { komgaBookSchema } from "@/clients/komga/schemas";
import { z } from "zod";

export const SUGGESTION_MIN_BOOKS = 2;
export const SUGGESTION_DAYS = 60;
export const SUGGESTION_LIMIT = 4;
const DISMISSED_KEY = "follow-suggestions:dismissed";
const seriesSchema = z.array(z.object({ id: z.string(), t: z.string(), pub: z.string(), seed: z.number(), thumbnail: z.string().optional() }).passthrough());
const booksSchema = z.array(komgaBookSchema.partial({ id: true }));
const dismissedSchema = z.array(z.string());
export type FollowSuggestion = { id: string; title: string; publisher: string; seed: number; thumbnail?: string };
type Book = z.infer<typeof booksSchema>[number];
type Series = z.infer<typeof seriesSchema>[number];

export function suggestFromReading(series: Series[], books: Book[], followed: ReadonlySet<string>, dismissed: ReadonlySet<string>, now = new Date()): FollowSuggestion[] {
  const cutoff = now.getTime() - SUGGESTION_DAYS * 86_400_000;
  const activity = new Map<string, { count: number; latest: number }>();
  for (const book of books) {
    // Komga documents readDate for completed books only. Do not invent activity dates for in-progress books.
    if (!book.readProgress?.completed || !book.readProgress.readDate) continue;
    const date = Date.parse(book.readProgress.readDate);
    if (!Number.isFinite(date) || date < cutoff || date > now.getTime()) continue;
    const value = activity.get(book.seriesId) ?? { count: 0, latest: 0 };
    activity.set(book.seriesId, { count: value.count + 1, latest: Math.max(value.latest, date) });
  }
  return series.filter((item) => !followed.has(item.id) && !dismissed.has(item.id) && (activity.get(item.id)?.count ?? 0) >= SUGGESTION_MIN_BOOKS)
    .sort((a, b) => (activity.get(b.id)?.latest ?? 0) - (activity.get(a.id)?.latest ?? 0) || a.id.localeCompare(b.id))
    .slice(0, SUGGESTION_LIMIT).map((item) => ({ id: item.id, title: item.t, publisher: item.pub, seed: item.seed, thumbnail: item.thumbnail }));
}

export async function getFollowSuggestions(): Promise<FollowSuggestion[]> {
  const [seriesRow, booksRow, dismissedRow, follows] = await Promise.all([
    db.select().from(kvCache).where(eq(kvCache.key, "komga:series")),
    db.select().from(kvCache).where(eq(kvCache.key, "komga:books")),
    db.select().from(kvCache).where(eq(kvCache.key, DISMISSED_KEY)),
    db.select({ id: followedSeries.komgaSeriesId }).from(followedSeries).where(eq(followedSeries.active, true)),
  ]);
  if (!seriesRow[0] || !booksRow[0]) return [];
  let seriesValue: unknown;
  let booksValue: unknown;
  let dismissedValue: unknown;
  try {
    seriesValue = JSON.parse(seriesRow[0].valueJson);
    booksValue = JSON.parse(booksRow[0].valueJson);
    dismissedValue = dismissedRow[0] ? JSON.parse(dismissedRow[0].valueJson) : null;
  } catch { return []; }
  const series = seriesSchema.safeParse(seriesValue);
  const books = booksSchema.safeParse(booksValue);
  const dismissed = dismissedRow[0] ? dismissedSchema.safeParse(dismissedValue) : null;
  if (!series.success || !books.success) return [];
  return suggestFromReading(series.data, books.data, new Set(follows.map((item) => item.id)), new Set(dismissed?.success ? dismissed.data : []));
}

export async function dismissFollowSuggestion(id: string): Promise<boolean> {
  const [seriesRow, dismissedRow] = await Promise.all([
    db.select().from(kvCache).where(eq(kvCache.key, "komga:series")),
    db.select().from(kvCache).where(eq(kvCache.key, DISMISSED_KEY)),
  ]);
  let seriesValue: unknown;
  let dismissedValue: unknown;
  try { seriesValue = seriesRow[0] ? JSON.parse(seriesRow[0].valueJson) : null; dismissedValue = dismissedRow[0] ? JSON.parse(dismissedRow[0].valueJson) : null; }
  catch { return false; }
  const series = seriesSchema.safeParse(seriesValue);
  if (!series.success || !series.data.some((item) => item.id === id)) return false;
  const existing = dismissedRow[0] ? dismissedSchema.safeParse(dismissedValue) : null;
  const ids = [...new Set([...(existing?.success ? existing.data : []), id])];
  const now = new Date().toISOString();
  await db.insert(kvCache).values({ key: DISMISSED_KEY, valueJson: JSON.stringify(ids), fetchedAt: now, ttlSeconds: 0 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(ids), fetchedAt: now } });
  return true;
}
