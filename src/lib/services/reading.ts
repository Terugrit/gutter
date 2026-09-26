import { eq } from "drizzle-orm";
import { db } from "@/db";
import { kvCache } from "@/db/schema";

export type ReadingStats = { booksRead: number; inProgress: number; seriesCompleted: number; readThisMonth: number };
type CachedBook = { seriesId: string; readProgress?: { completed: boolean; readDate?: string | null } | null };

export function readingStatsFromBooks(books: CachedBook[], today = new Date()): ReadingStats {
  const completed = books.filter((book) => book.readProgress?.completed);
  const inProgress = books.filter((book) => book.readProgress && !book.readProgress.completed);
  const allSeries = new Set(books.map((book) => book.seriesId));
  const month = today.toISOString().slice(0, 7);
  return {
    booksRead: completed.length,
    inProgress: inProgress.length,
    seriesCompleted: [...allSeries].filter((seriesId) => books.filter((book) => book.seriesId === seriesId).every((book) => book.readProgress?.completed)).length,
    readThisMonth: completed.filter((book) => book.readProgress?.readDate?.slice(0, 7) === month).length,
  };
}

export async function getLiveReadingStats(): Promise<ReadingStats | null> {
  try {
    const row = (await db.select().from(kvCache).where(eq(kvCache.key, "komga:books")))[0];
    if (!row) return null;
    const books = JSON.parse(row.valueJson) as CachedBook[];
    return readingStatsFromBooks(books);
  } catch { return null; }
}
