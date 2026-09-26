import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries, issues, kvCache } from "@/db/schema";
export type LiveLibraryItem = { id: string; t: string; pub: string; seed: number; fol: boolean; attention: boolean; thumbnail: string };
export async function getLiveLibrary(): Promise<LiveLibraryItem[] | null> { try { const cache = await db.select().from(kvCache).where(eq(kvCache.key, "komga:series")); const active = await db.select().from(followedSeries).where(eq(followedSeries.active, true)); const follows = new Map(active.map((item) => [item.komgaSeriesId, item])); const library = cache[0] ? (JSON.parse(cache[0].valueJson) as Omit<LiveLibraryItem, "fol" | "attention">[]).map((item) => ({ ...item, fol: follows.has(item.id), attention: follows.get(item.id)?.matchStatus === "unmatched" })) : []; const discovered = active.filter((item) => item.komgaSeriesId.startsWith("discover:")).map((item) => ({ id: item.komgaSeriesId, t: item.title, pub: item.publisher ?? "Unknown publisher", seed: item.id, fol: true, attention: item.matchStatus === "unmatched", thumbnail: "" })); return cache[0] || discovered.length ? [...library, ...discovered] : null; } catch { return null; } }
type CachedBook = { seriesId: string; metadata?: { number?: string | null } };
export async function applyKomgaOwnership(followIds?: readonly number[]) {
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, "komga:books")))[0];
  if (!row) return;
  let books: CachedBook[];
  try { books = JSON.parse(row.valueJson) as CachedBook[]; } catch { return; }
  const follows = await db.select().from(followedSeries).where(eq(followedSeries.active, true));
  for (const follow of follows.filter((item) => !item.komgaSeriesId.startsWith("discover:") && (!followIds || followIds.includes(item.id)))) {
    await db.update(issues).set({ owned: false }).where(eq(issues.followedSeriesId, follow.id));
    const numbers = new Set(books.filter((book) => book.seriesId === follow.komgaSeriesId).map((book) => book.metadata?.number?.trim()).filter((number): number is string => Boolean(number)));
    for (const number of numbers) await db.update(issues).set({ owned: true }).where(and(eq(issues.followedSeriesId, follow.id), eq(issues.number, number)));
  }
}
export async function reconcileDiscoverFollows(librarySeries: Array<{ id: string; t: string; pub: string }>) {
  const follows = await db.select().from(followedSeries);
  const normalized = (value: string) => value.normalize("NFKD").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  for (const discovery of follows.filter((item) => item.active && item.komgaSeriesId.startsWith("discover:"))) {
    const match = librarySeries.find((item) => normalized(item.t) === normalized(discovery.title) && (!discovery.publisher || normalized(discovery.publisher) === normalized(item.pub)));
    if (!match) continue;
    const real = follows.find((item) => item.komgaSeriesId === match.id);
    if (real) await db.update(followedSeries).set({ active: false }).where(eq(followedSeries.id, discovery.id));
    else await db.update(followedSeries).set({ komgaSeriesId: match.id, title: match.t, publisher: match.pub }).where(eq(followedSeries.id, discovery.id));
  }
}
