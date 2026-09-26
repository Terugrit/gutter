import { and, asc, eq, gt, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries, issues } from "@/db/schema";
import { localDate } from "@/jobs/status";
import { excludedIssue } from "./missing";

export type UpcomingIssue = {
  id: number; seriesId: string; series: string; number: string; title: string | null;
  date: string; coverUrl: string | null; moved: boolean; previousDate: string | null; week: string;
};

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function weekStart(date: string) {
  const value = new Date(`${date}T12:00:00Z`);
  return addDays(date, -((value.getUTCDay() + 6) % 7));
}

export async function getUpcomingIssues(days = 30, now = new Date()): Promise<UpcomingIssue[]> {
  const today = localDate(now);
  const through = addDays(today, days);
  const rows = await db.select({ issue: issues, series: followedSeries }).from(issues)
    .innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id))
    .where(and(eq(followedSeries.active, true), inArray(followedSeries.matchStatus, ["auto", "confirmed"]), eq(issues.active, true), eq(issues.owned, false), gt(issues.storeDate, today), lte(issues.storeDate, through)))
    .orderBy(asc(issues.storeDate), asc(followedSeries.title), asc(issues.number));
  const recent = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  return rows.filter(({ issue, series }) => !excludedIssue(issue.number, issue.title, issue.skippedAt) && (series.monitorMode === "all" || issue.storeDate! >= series.createdAt.slice(0, 10)))
    .map(({ issue, series }) => ({ id: issue.id, seriesId: series.komgaSeriesId, series: series.title, number: issue.number, title: issue.title, date: issue.storeDate!, coverUrl: issue.coverUrl, moved: issue.dateChangedAt !== null && issue.dateChangedAt >= recent, previousDate: issue.previousDate, week: weekStart(issue.storeDate!) }));
}
