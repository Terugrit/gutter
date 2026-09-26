import { and, asc, eq, gte, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { localDate } from "@/jobs/status";
import { followedSeries, issues } from "@/db/schema";

export type MissingIssue = { id: string; seriesId?: string; s: string; i: string | number; d: string; comicVineVolumeId?: number | null };

export function plainIssueNumber(number: string) { return /^\d+(?:\.\d+)?$/.test(number.trim()); }
export function excludedIssue(number: string, title: string | null, skippedAt?: number | null) { return skippedAt != null || !plainIssueNumber(number) || /\b(annual|variant)\b/i.test(`${number} ${title ?? ""}`); }

export async function getMissingIssues(): Promise<MissingIssue[]> {
  const rows = await db.select({ skippedAt: issues.skippedAt, issueId: issues.id, number: issues.number, title: issues.title, storeDate: issues.storeDate, owned: issues.owned, createdAt: followedSeries.createdAt, monitorMode: followedSeries.monitorMode, seriesId: followedSeries.komgaSeriesId, seriesTitle: followedSeries.title, comicVineVolumeId: followedSeries.comicvineVolumeId }).from(issues).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).where(and(eq(followedSeries.active, true), eq(issues.active, true), eq(issues.owned, false), lte(issues.storeDate, localDate()), or(eq(followedSeries.monitorMode, "all"), gte(issues.storeDate, sql<string>`substr(${followedSeries.createdAt}, 1, 10)`)))).orderBy(asc(issues.storeDate), asc(issues.number));
  return rows.filter((row) => !excludedIssue(row.number, row.title, row.skippedAt)).map((row) => ({ id: String(row.issueId), seriesId: row.seriesId, s: row.seriesTitle, i: row.number, d: row.storeDate ?? "Date unknown", comicVineVolumeId: row.comicVineVolumeId }));
}

