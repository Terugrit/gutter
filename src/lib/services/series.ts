import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries, issues, kvCache } from "@/db/schema";

import { getSeriesProgress, type SeriesProgress } from "./series-progress";
import { localDate } from "@/jobs/status";
import { getKapowarrStatus, type KapowarrStatus } from "./kapowarr-status";

type CachedKomgaSeries = { id: string; t: string; pub: string; seed: number; thumbnail?: string };
export type SeriesDetail = {
  kapowarrStatus: KapowarrStatus | null; kapowarrSent: boolean;
  progress: SeriesProgress; today: string;
  id: string; title: string; publisher: string | null; seed: number; thumbnail?: string; matchStatus: "auto" | "confirmed" | "unmatched"; metronSeriesId: number | null; monitorMode: "future_only" | "all";
  issues: { id: number; number: string; title: string | null; storeDate: string | null; coverUrl: string | null; owned: boolean; skippedAt: number | null; previousDate: string | null; dateChangedAt: number | null }[];
};
export async function getSeriesDetail(komgaSeriesId: string): Promise<SeriesDetail | null> {
  const follow = (await db.select().from(followedSeries).where(and(eq(followedSeries.komgaSeriesId, komgaSeriesId), eq(followedSeries.active, true))))[0];
  if (!follow) return null;
  const source = (await db.select().from(kvCache).where(eq(kvCache.key, "komga:series")))[0];
  let cached: CachedKomgaSeries | undefined;
  try { cached = (JSON.parse(source?.valueJson ?? "[]") as CachedKomgaSeries[]).find((item) => item.id === komgaSeriesId); } catch { /* Cache is optional for a followed series. */ }
  const cachedIssues = await db.select().from(issues).where(and(eq(issues.followedSeriesId, follow.id), eq(issues.active, true))).orderBy(asc(issues.storeDate), asc(issues.number));
  return { kapowarrStatus: await getKapowarrStatus(follow.id), kapowarrSent: follow.kapowarrVolumeId !== null, progress: getSeriesProgress(cachedIssues, follow.seriesStatus), today: localDate(), id: komgaSeriesId, title: follow.title, publisher: follow.publisher, seed: cached?.seed ?? follow.id, thumbnail: cached?.thumbnail, matchStatus: follow.matchStatus, metronSeriesId: follow.metronSeriesId, monitorMode: follow.monitorMode, issues: cachedIssues.map((issue) => ({ id: issue.id, number: issue.number, title: issue.title, storeDate: issue.storeDate, coverUrl: issue.coverUrl, owned: issue.owned, skippedAt: issue.skippedAt, previousDate: issue.previousDate, dateChangedAt: issue.dateChangedAt })) };
}
export async function unfollowSeries(komgaSeriesId: string) {
  const follow = (await db.select({ id: followedSeries.id }).from(followedSeries).where(and(eq(followedSeries.komgaSeriesId, komgaSeriesId), eq(followedSeries.active, true))))[0];
  if (!follow) return false;
  await db.update(followedSeries).set({ active: false }).where(eq(followedSeries.id, follow.id));
  return true;
}
