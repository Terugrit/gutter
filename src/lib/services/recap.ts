import { eq } from "drizzle-orm";
import { z } from "zod";
import { komgaBookSchema } from "@/clients/komga/schemas";
import { db } from "@/db";
import { kvCache } from "@/db/schema";
import { localDate } from "@/jobs/status";

const booksSchema = z.array(komgaBookSchema.partial({ id: true }));
const seriesSchema = z.array(z.object({ id: z.string(), t: z.string() }).passthrough());
type Book = z.infer<typeof booksSchema>[number];
export type ReadingRecap = { year: number; years: number[]; booksCompleted: number; seriesFinished: number; busiestMonth: number | null; months: number[]; longestStreak: number; topSeries: { id: string; title: string; count: number }[] };

function readDay(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}(?:$|T)/.test(value)) return null;
  const instant = Date.parse(value);
  if (!Number.isFinite(instant)) return null;
  if (value.length === 10 && new Date(instant).toISOString().slice(0, 10) !== value) return null;
  // Date-only values represent a calendar day, not an instant in UTC.
  return value.length === 10 ? value : localDate(new Date(instant));
}

export function recapFromBooks(books: Book[], titles: ReadonlyMap<string, string>, year: number): Omit<ReadingRecap, "years"> {
  const months = Array<number>(12).fill(0);
  const counts = new Map<string, number>();
  const days = new Set<string>();
  const bySeries = new Map<string, Book[]>();
  for (const book of books) {
    const group = bySeries.get(book.seriesId) ?? [];
    group.push(book);
    bySeries.set(book.seriesId, group);
    if (!book.readProgress?.completed) continue;
    const day = readDay(book.readProgress.readDate);
    if (!day || Number(day.slice(0, 4)) !== year) continue;
    months[Number(day.slice(5, 7)) - 1] += 1;
    counts.set(book.seriesId, (counts.get(book.seriesId) ?? 0) + 1);
    days.add(day);
  }
  let seriesFinished = 0;
  for (const group of bySeries.values()) {
    if (!group.length || !group.every((book) => book.readProgress?.completed && readDay(book.readProgress.readDate))) continue;
    const last = group.map((book) => readDay(book.readProgress?.readDate)!).sort().at(-1)!;
    if (Number(last.slice(0, 4)) === year) seriesFinished += 1;
  }
  let streak = 0;
  let longestStreak = 0;
  let previous: number | null = null;
  for (const day of [...days].sort()) {
    const timestamp = Date.parse(`${day}T00:00:00Z`);
    streak = previous !== null && timestamp - previous === 86_400_000 ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = timestamp;
  }
  const busiest = Math.max(...months);
  return {
    year, booksCompleted: months.reduce((sum, count) => sum + count, 0), seriesFinished,
    busiestMonth: busiest ? months.indexOf(busiest) + 1 : null, months, longestStreak,
    topSeries: [...counts].sort((a, b) => b[1] - a[1] || (titles.get(a[0]) ?? a[0]).localeCompare(titles.get(b[0]) ?? b[0])).slice(0, 3).map(([id, count]) => ({ id, count, title: titles.get(id) ?? id })),
  };
}

export async function getReadingRecap(year?: number): Promise<ReadingRecap | null> {
  const [booksRow, seriesRow] = await Promise.all([
    db.select().from(kvCache).where(eq(kvCache.key, "komga:books")),
    db.select().from(kvCache).where(eq(kvCache.key, "komga:series")),
  ]);
  if (!booksRow[0]) return null;
  let booksValue: unknown;
  let seriesValue: unknown;
  try { booksValue = JSON.parse(booksRow[0].valueJson); seriesValue = seriesRow[0] ? JSON.parse(seriesRow[0].valueJson) : null; }
  catch { return null; }
  const parsed = booksSchema.safeParse(booksValue);
  const series = seriesRow[0] ? seriesSchema.safeParse(seriesValue) : null;
  if (!parsed.success) return null;
  const years = [...new Set(parsed.data.filter((book) => book.readProgress?.completed).map((book) => readDay(book.readProgress?.readDate)).filter((day): day is string => Boolean(day)).map((day) => Number(day.slice(0, 4))))].sort((a, b) => b - a);
  const selected = year ?? Number(localDate().slice(0, 4));
  const titles = new Map(series?.success ? series.data.map((item) => [item.id, item.t] as const) : []);
  return { ...recapFromBooks(parsed.data, titles, selected), years };
}
