import { and, eq, inArray, lte } from "drizzle-orm";
import { NtfyClient } from "@/clients/ntfy/client";
import { db } from "@/db";
import { followedSeries, issues, notifications } from "@/db/schema";
import { env } from "@/env";
import { notificationActions } from "@/lib/notification-actions";
import { excludedIssue } from "@/lib/services/missing";
import { refreshFollowedIssues } from "@/lib/services/metron";
import { localDate, runTrackedJob } from "./status";

type Release = { issueId: number; seriesTitle: string; number: string; issueTitle: string | null; storeDate: string | null; coverUrl: string | null };
function ntfy() { return env.NTFY_URL && env.NTFY_TOPIC ? new NtfyClient({ baseUrl: env.NTFY_URL, topic: env.NTFY_TOPIC, token: env.NTFY_TOKEN }) : null; }
export async function pendingReleases(): Promise<Release[]> {
  const rows = await db.select({ skippedAt: issues.skippedAt, issueId: issues.id, seriesTitle: followedSeries.title, number: issues.number, issueTitle: issues.title, storeDate: issues.storeDate, coverUrl: issues.coverUrl, createdAt: followedSeries.createdAt, mode: followedSeries.monitorMode, status: notifications.ntfyStatus, sentAt: notifications.sentAt, deletedAt: notifications.deletedAt }).from(issues).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).leftJoin(notifications, and(eq(notifications.issueId, issues.id), eq(notifications.type, "new_release"))).where(and(eq(followedSeries.active, true), eq(issues.active, true), eq(issues.owned, false), lte(issues.storeDate, localDate()), inArray(followedSeries.matchStatus, ["auto", "confirmed"])));
  return rows.filter((row) => !row.sentAt && !row.deletedAt && !excludedIssue(row.number, row.issueTitle, row.skippedAt) && (row.mode === "all" || (row.storeDate !== null && row.storeDate >= row.createdAt.slice(0, 10))));
}
export async function sendRelease(release: Release) {
  const key = `new-release:${release.issueId}`;
  await db.insert(notifications).values({ issueId: release.issueId, type: "new_release", dedupeKey: key, ntfyStatus: "pending" }).onConflictDoNothing();
  const notification = (await db.select().from(notifications).where(eq(notifications.dedupeKey, key)))[0];
  if (!notification || notification.sentAt || notification.deletedAt) return false;
  const client = ntfy();
  if (!client || !env.APP_BASE_URL) { await db.update(notifications).set({ ntfyStatus: "Configure ntfy and the public app URL in the deployment settings" }).where(eq(notifications.id, notification.id)); return false; }
  try {
    const follow = env.ACTION_SECRET ? (await db.select({ comicVineVolumeId: followedSeries.comicvineVolumeId, kapowarrVolumeId: followedSeries.kapowarrVolumeId }).from(issues).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).where(eq(issues.id, release.issueId)))[0] : null;
    const actions = notificationActions(notification.id, env.APP_BASE_URL, env.ACTION_SECRET, follow?.comicVineVolumeId ?? null, follow?.kapowarrVolumeId ?? null);
    await client.publish({ title: `New: ${release.seriesTitle} #${release.number}`, body: `${release.issueTitle ?? "Untitled issue"} / ${release.storeDate ?? "Date unknown"}`, click: `${env.APP_BASE_URL.replace(/\/$/, "")}/notifications/${notification.id}`, attach: release.coverUrl ?? undefined, actions });
    await db.update(notifications).set({ sentAt: new Date().toISOString(), ntfyStatus: "sent" }).where(eq(notifications.id, notification.id));
    return true;
  } catch (error) {
    await db.update(notifications).set({ ntfyStatus: error instanceof Error ? error.message : "failed" }).where(eq(notifications.id, notification.id));
    return false;
  }
}
export async function refreshReleases() { return runTrackedJob("refresh-releases", async () => { await refreshFollowedIssues(); const releases = await pendingReleases(); let sent = 0; let failed = 0; for (const release of releases) { if (await sendRelease(release)) sent += 1; else failed += 1; } if (failed) throw new Error(`${failed} notification deliveries failed; retry the release refresh.`); return sent; }); }

