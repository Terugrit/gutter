import { and, asc, count, desc, eq, isNull, min } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries, issues, notifications } from "@/db/schema";

export type Notification = { id: number; seriesId?: string; comicVineVolumeId?: number | null; s: string; i: string; d: string; pub: string; t: string; w: string; a: string; u: number; own: boolean; desc: string; seed: number; coverUrl: string | null };
function displayDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`)) : "Date unknown"; }
function credits(value: string | null) { try { const entries = JSON.parse(value ?? "[]") as Array<{ role?: string | Array<string | { name?: string }>; roles?: Array<string | { name?: string }>; person?: { name?: string }; creator?: string | { name?: string }; name?: string }>; const namesFor = (wanted: RegExp) => entries.flatMap((entry) => { const rawRoles = [...(Array.isArray(entry.role) ? entry.role : entry.role ? [entry.role] : []), ...(entry.roles ?? [])]; const roles = rawRoles.map((role) => typeof role === "string" ? role : role.name ?? ""); if (!roles.some((role) => wanted.test(role))) return []; const creator = typeof entry.creator === "string" ? entry.creator : entry.creator?.name; return [entry.person?.name ?? creator ?? entry.name].filter((name): name is string => Boolean(name)); }); return { writer: namesFor(/writer|script|plot/i).join(", ") || "Not listed", artist: namesFor(/artist|pencill|illustrator/i).join(", ") || "Not listed" }; } catch { return { writer: "Not listed", artist: "Not listed" }; } }
function toNotification({ notification, issue, series }: { notification: typeof notifications.$inferSelect; issue: typeof issues.$inferSelect; series: typeof followedSeries.$inferSelect }): Notification {
  const c = credits(issue.creditsJson);
  return { id: notification.id, seriesId: series.komgaSeriesId, comicVineVolumeId: series.comicvineVolumeId, s: series.title, i: issue.number, d: displayDate(issue.storeDate), pub: series.publisher ?? "Not listed", t: issue.title ?? `${series.title} #${issue.number}`, w: c.writer, a: c.artist, u: notification.readAt ? 0 : 1, own: issue.owned, desc: issue.description ?? "No description is available for this issue.", seed: series.id, coverUrl: issue.coverUrl };
}

function notificationRows(where = eq(notifications.type, "new_release")) {
  return db.select({ notification: notifications, issue: issues, series: followedSeries }).from(notifications).innerJoin(issues, eq(notifications.issueId, issues.id)).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).where(where);
}

export async function getNotifications(): Promise<Notification[]> {
  const rows = await notificationRows().orderBy(desc(issues.storeDate), asc(notifications.id));
  return rows.map(toNotification);
}
export async function getNotification(id: number) {
  const row = (await notificationRows(and(eq(notifications.type, "new_release"), eq(notifications.id, id))))[0];
  return row ? toNotification(row) : null;
}
export async function markNotificationRead(id: number, unread = false) { await db.update(notifications).set({ readAt: unread ? null : new Date().toISOString() }).where(eq(notifications.id, id)); }
export async function getUnreadNotificationCount() {
  const result = await db.select({ value: count(notifications.id) }).from(notifications).innerJoin(issues, eq(notifications.issueId, issues.id)).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).where(and(eq(notifications.type, "new_release"), isNull(notifications.readAt)));
  return result[0]?.value ?? 0;
}
export async function oldestNotificationDate() {
  const result = await db.select({ value: min(issues.storeDate) }).from(notifications).innerJoin(issues, eq(notifications.issueId, issues.id)).where(eq(notifications.type, "new_release"));
  return result[0]?.value ? displayDate(result[0].value).replace(/ \d{4}$/, "") : "";
}
