import { eq } from "drizzle-orm";
import { db } from "@/db";
import { kvCache } from "@/db/schema";

export type ReadingStats = { booksRead: number; inProgress: number; seriesCompleted: number; readThisMonth: number };
type CachedBook = { seriesId: string; readProgress?: { completed: boolean; readDate?: string | null } | null };

export function readingStatsFromBooks(books: CachedBook[], today = new Date()): ReadingStats {
  const month = today.toISOString().slice(0, 7);
  let booksRead = 0;
  let inProgress = 0;
  let readThisMonth = 0;
  const seriesComplete = new Map<string, boolean>();
  for (const book of books) {
    const completed = Boolean(book.readProgress?.completed);
    seriesComplete.set(book.seriesId, (seriesComplete.get(book.seriesId) ?? true) && completed);
    if (completed) {
      booksRead += 1;
      if (book.readProgress?.readDate?.slice(0, 7) === month) readThisMonth += 1;
    } else if (book.readProgress) {
      inProgress += 1;
    }
  }
  return {
    booksRead,
    inProgress,
    seriesCompleted: [...seriesComplete.values()].filter(Boolean).length,
    readThisMonth,
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
