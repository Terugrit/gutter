import { KomgaClient } from "@/clients/komga/client";
import { db } from "@/db";
import { kvCache } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { followedSeries, issues } from "@/db/schema";
import { env } from "@/env";
import { NtfyClient } from "@/clients/ntfy/client";
import { getMissingIssues } from "@/lib/services/missing";
import { getSelectedKomgaLibraryId } from "@/lib/services/settings";
import { applyKomgaOwnership, reconcileDiscoverFollows } from "@/lib/services/library";
import { runTrackedJob } from "./status";

export async function syncKomga() { return runTrackedJob("sync-komga", doSyncKomga); }
async function doSyncKomga() {
  if (!env.KOMGA_URL || !env.KOMGA_API_KEY) return { skipped: true, series: 0, books: 0 };
  const client = new KomgaClient({ baseUrl: env.KOMGA_URL, apiKey: env.KOMGA_API_KEY });
  const libraryId = await getSelectedKomgaLibraryId();
  const baselineKey = `komga:ownership-baseline:${libraryId ?? "all"}`;
  const hadBaseline = Boolean((await db.select().from(kvCache).where(eq(kvCache.key, baselineKey)))[0]);
  const missingBefore = hadBaseline ? await getMissingIssues() : [];
  const [series, books] = await Promise.all([client.listSeries(libraryId ?? undefined), client.listBooks(libraryId ?? undefined)]);
  const librarySeries = series.map((item, index) => ({ id: item.id, t: item.metadata?.title || item.name, pub: item.metadata?.publisher || "Unknown publisher", seed: index + 1, thumbnail: client.thumbnailPath(item.id), metadata: item.metadata }));
  const now = new Date().toISOString();
  for (const [key, source] of [["komga:series", librarySeries], ["komga:books", books]] as const) {
    const valueJson = JSON.stringify(source);
    await db.insert(kvCache).values({ key, valueJson, fetchedAt: now, ttlSeconds: 3600 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson, fetchedAt: now, ttlSeconds: 3600 } });
  }
  await reconcileDiscoverFollows(librarySeries);
  await applyKomgaOwnership();
  const fetchedAt = new Date().toISOString();
  await db.insert(kvCache).values({ key: baselineKey, valueJson: "true", fetchedAt, ttlSeconds: 0 }).onConflictDoUpdate({ target: kvCache.key, set: { fetchedAt } });
  if (missingBefore.length && env.NTFY_URL && env.NTFY_TOPIC && env.APP_BASE_URL) {
    const ids = missingBefore.map((item) => Number(item.id));
    const arrived = await db.select({ issueId: issues.id, seriesId: followedSeries.komgaSeriesId, title: followedSeries.title, volumeId: followedSeries.kapowarrVolumeId }).from(issues).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).where(and(inArray(issues.id, ids), eq(issues.owned, true), eq(followedSeries.active, true)));
    const groups = new Map<string, { title: string; count: number }>();
    for (const item of arrived) {
      if (!item.volumeId) continue;
      const group = groups.get(item.seriesId) ?? { title: item.title, count: 0 };
      group.count += 1;
      groups.set(item.seriesId, group);
    }
    const ntfy = new NtfyClient({ baseUrl: env.NTFY_URL, topic: env.NTFY_TOPIC, token: env.NTFY_TOKEN });
    for (const [seriesId, group] of groups) {
      try { await ntfy.publish({ title: `${group.count} new ${group.count === 1 ? "issue" : "issues"} of ${group.title} are in Komga`, body: "Your comics are ready to read.", click: `${env.APP_BASE_URL.replace(/\/$/, "")}/series/${encodeURIComponent(seriesId)}` }); }
      catch (error) { console.error("Komga arrival notification failed:", error instanceof Error ? error.message : "Unknown failure"); }
    }
  }
  return { skipped: false, series: series.length, books: books.length };
}
