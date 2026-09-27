import { eq } from "drizzle-orm";
import { db } from "@/db";
import { kvCache } from "@/db/schema";
import { env } from "@/env";
import { NtfyClient } from "@/clients/ntfy/client";

export type JobName = "backup-db" | "sync-komga" | "scan-komga" | "refresh-releases" | "weekly-digest" | "refresh-discover" | "check-kapowarr" | "refresh-upcoming-releases" | "check-release-dates" | "tune-interest-weights";
export type JobStatus = { state: "running" | "success" | "failed"; startedAt: string; finishedAt?: string; lastSuccessAt?: string; error?: string; consecutiveFailures?: number; failureAlertedAt?: string };
export const JOB_FAILURE_ALERT_AFTER = 2;
const pending = new Set<JobName>();
let tail = Promise.resolve();
export function localDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: env.TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export async function getJobStatus(name: JobName): Promise<JobStatus | null> {
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, `job:${name}`)))[0];
  if (!row) return null;
  try { return JSON.parse(row.valueJson) as JobStatus; } catch { return null; }
}
async function save(name: JobName, status: JobStatus) {
  const now = new Date().toISOString();
  await db.insert(kvCache).values({ key: `job:${name}`, valueJson: JSON.stringify(status), fetchedAt: now, ttlSeconds: 0 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(status), fetchedAt: now } });
}
async function alert(name: JobName, title: string, body: string, high = false): Promise<boolean> {
  if (!env.NTFY_URL || !env.NTFY_TOPIC || !env.APP_BASE_URL) return false;
  try {
    await new NtfyClient({ baseUrl: env.NTFY_URL, topic: env.NTFY_TOPIC, token: env.NTFY_TOKEN }).publish({
      title, body, click: `${env.APP_BASE_URL.replace(/\/$/, "")}/settings`,
      ...(high ? { priority: "high", tags: "warning" } as const : {})
    });
    return true;
  } catch (error) {
    console.error(`Job ${name} ntfy alert failed:`, error instanceof Error ? error.message : "Unknown failure");
    return false;
  }
}
export function serializeOperation<T>(work: () => Promise<T>): Promise<T> {
  const run = tail.then(work);
  tail = run.then(() => undefined, () => undefined);
  return run;
}
export async function runTrackedJob<T>(name: JobName, work: () => Promise<T>): Promise<T | null> {
  if (pending.has(name)) return null;
  pending.add(name);
  const run = serializeOperation(async () => {
    try {
      const previous = await getJobStatus(name);
      const status: JobStatus = { state: "running", startedAt: new Date().toISOString(), lastSuccessAt: previous?.lastSuccessAt, consecutiveFailures: previous?.consecutiveFailures ?? 0, failureAlertedAt: previous?.failureAlertedAt };
      await save(name, status);
      try {
        const result = await work();
        if (status.failureAlertedAt) await alert(name, `Gutter: ${name} recovered`, "The job completed successfully.");
        await save(name, { ...status, state: "success", finishedAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(), consecutiveFailures: 0, failureAlertedAt: undefined });
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown failure";
        const consecutiveFailures = status.consecutiveFailures! + 1;
        const failureAlertedAt = status.failureAlertedAt ?? (consecutiveFailures >= JOB_FAILURE_ALERT_AFTER && await alert(name, `Gutter: ${name} is failing`, message.slice(0, 200), true) ? new Date().toISOString() : undefined);
        await save(name, { ...status, state: "failed", finishedAt: new Date().toISOString(), error: message, consecutiveFailures, failureAlertedAt });
        throw error;
      }
    } finally { pending.delete(name); }
  });
  return run;
}
