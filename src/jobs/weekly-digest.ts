import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { NtfyClient } from "@/clients/ntfy/client";
import { db } from "@/db";
import { followedSeries, issues, notifications } from "@/db/schema";
import { env } from "@/env";
import { excludedIssue } from "@/lib/services/missing";
import { localDate, runTrackedJob } from "./status";
function weekKey(date = new Date()) { const day = localDate(date); const monday = new Date(`${day}T12:00:00Z`); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); return monday.toISOString().slice(0, 10); }
function shortDate(value: string) { return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
export async function weeklyDigest(now = new Date()) { return runTrackedJob("weekly-digest", async () => {
  const start = weekKey(now); const end = new Date(`${start}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 6);
  const candidates = await db.select({ issue: issues, series: followedSeries }).from(issues).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).where(and(eq(followedSeries.active, true), eq(issues.active, true), gte(issues.storeDate, start), lte(issues.storeDate, end.toISOString().slice(0, 10)), inArray(followedSeries.matchStatus, ["auto", "confirmed"])));
  const rows = candidates.filter(({ issue, series }) => !excludedIssue(issue.number, issue.title, issue.skippedAt) && (series.monitorMode === "all" || (issue.storeDate !== null && issue.storeDate >= series.createdAt.slice(0, 10))));
  const previous = (await db.select({ sentAt: notifications.sentAt }).from(notifications).where(eq(notifications.type, "weekly_digest")).orderBy(desc(notifications.sentAt)))[0]?.sentAt;
  const lastSent = previous ? new Date(previous).getTime() : -Infinity;
  const today = localDate(now);
  const movedCandidates = await db.select({ issue: issues, series: followedSeries }).from(issues).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).where(and(eq(followedSeries.active, true), eq(issues.active, true), eq(issues.owned, false), inArray(followedSeries.matchStatus, ["auto", "confirmed"])));
  const moved = movedCandidates.filter(({ issue, series }) => issue.dateChangedAt !== null && issue.dateChangedAt > lastSent && issue.dateChangedAt <= now.getTime() && issue.previousDate !== null && (issue.previousDate >= today || (issue.storeDate !== null && issue.storeDate >= today)) && !excludedIssue(issue.number, issue.title, issue.skippedAt) && (series.monitorMode === "all" || (issue.storeDate !== null && issue.storeDate >= series.createdAt.slice(0, 10))));
  if ((!rows.length && !moved.length) || !env.NTFY_URL || !env.NTFY_TOPIC) return false;
  const key = `weekly-digest:${start}`;
  await db.insert(notifications).values({ issueId: (rows[0] ?? moved[0]).issue.id, type: "weekly_digest", dedupeKey: key, ntfyStatus: "pending" }).onConflictDoNothing();
  const record = (await db.select().from(notifications).where(eq(notifications.dedupeKey, key)))[0];
  if (!record || record.sentAt) return false;
  const sections = [rows.length ? rows.map(({ issue, series }) => `${series.title} #${issue.number} — ${issue.title ?? "Untitled issue"}`).join("\n") : "", moved.length ? `Moved\n${moved.map(({ issue, series }) => `${series.title} #${issue.number}: ${shortDate(issue.previousDate!)} → ${issue.storeDate ? shortDate(issue.storeDate) : "Date unknown"}`).join("\n")}` : ""].filter(Boolean);
  try { await new NtfyClient({ baseUrl: env.NTFY_URL, topic: env.NTFY_TOPIC, token: env.NTFY_TOKEN }).publish({ title: "Gutter weekly digest", body: sections.join("\n\n") }); await db.update(notifications).set({ sentAt: new Date().toISOString(), ntfyStatus: "sent" }).where(eq(notifications.id, record.id)); return true; }
  catch (error) { await db.update(notifications).set({ ntfyStatus: error instanceof Error ? error.message : "failed" }).where(eq(notifications.id, record.id)); throw error; }
}); }


