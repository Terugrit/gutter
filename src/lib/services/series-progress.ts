import { excludedIssue } from "./missing";
import { localDate } from "@/jobs/status";

export type SeriesProgress = { owned: number; released: number; total: number; state: "incomplete" | "up-to-date" | "complete" };
type ProgressIssue = { number: string; title: string | null; storeDate: string | null; owned: boolean; active: boolean; skippedAt: number | null };
export function normalizeSeriesStatus(status?: string | null): string | null {
  const value = status?.toLowerCase();
  return value && ["completed", "cancelled", "hiatus", "ongoing"].includes(value) ? value : null;
}
export function getSeriesProgress(issues: ProgressIssue[], status: string | null, today = localDate()): SeriesProgress {
  const ordinary = issues.filter((issue) => issue.active && !excludedIssue(issue.number, issue.title, issue.skippedAt));
  const released = ordinary.filter((issue) => issue.storeDate !== null && issue.storeDate <= today);
  // Count owned released issues so advance copies cannot overfill the released denominator.
  const owned = released.filter((issue) => issue.owned).length;
  const ended = status === "completed" || status === "cancelled";
  const state = released.length > 0 && owned === released.length ? ended ? "complete" : "up-to-date" : "incomplete";
  return { owned, released: released.length, total: ordinary.length, state };
}
