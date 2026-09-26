import { and, eq, inArray } from "drizzle-orm";
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
  const numbersBySeries = new Map<string, Set<string>>();
  for (const book of books) {
    const number = book.metadata?.number?.trim();
    if (!number) continue;
    const numbers = numbersBySeries.get(book.seriesId) ?? new Set<string>();
    numbers.add(number);
    numbersBySeries.set(book.seriesId, numbers);
  }
  const targets = follows.filter((item) => !item.komgaSeriesId.startsWith("discover:") && (!followIds || followIds.includes(item.id)));
  db.transaction((tx) => {
    for (const follow of targets) {
      tx.update(issues).set({ owned: false }).where(eq(issues.followedSeriesId, follow.id)).run();
      const numbers = [...(numbersBySeries.get(follow.komgaSeriesId) ?? [])];
      // Keep each IN clause below SQLite's bind-parameter limit for unusually long series.
      for (let start = 0; start < numbers.length; start += 900) {
        tx.update(issues).set({ owned: true }).where(and(eq(issues.followedSeriesId, follow.id), inArray(issues.number, numbers.slice(start, start + 900)))).run();
      }
    }
  });
}
export async function reconcileDiscoverFollows(librarySeries: Array<{ id: string; t: string; pub: string }>) {
  const follows = await db.select().from(followedSeries);
  const normalized = (value: string) => value.normalize("NFKD").toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
  const byTitle = new Map<string, Array<{ id: string; t: string; pub: string }>>();
  const existingByKomgaId = new Map(follows.map((item) => [item.komgaSeriesId, item]));
  for (const series of librarySeries) {
    const title = normalized(series.t);
    const matches = byTitle.get(title) ?? [];
    matches.push(series);
    byTitle.set(title, matches);
  }
  for (const discovery of follows.filter((item) => item.active && item.komgaSeriesId.startsWith("discover:"))) {
    const match = byTitle.get(normalized(discovery.title))?.find((item) => !discovery.publisher || normalized(discovery.publisher) === normalized(item.pub));
    if (!match) continue;
    const real = existingByKomgaId.get(match.id);
    if (real) await db.update(followedSeries).set({ active: false }).where(eq(followedSeries.id, discovery.id));
    else await db.update(followedSeries).set({ komgaSeriesId: match.id, title: match.t, publisher: match.pub }).where(eq(followedSeries.id, discovery.id));
  }
}
