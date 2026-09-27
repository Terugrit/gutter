import { and, eq, inArray } from "drizzle-orm";
import { KomgaClient } from "@/clients/komga/client";
import { db } from "@/db";
import { followedSeries, kvCache } from "@/db/schema";
import { env } from "@/env";
import { getMissingIssues } from "@/lib/services/missing";
import { refreshKapowarrStatus } from "@/lib/services/kapowarr-status";
import { getSelectedKomgaLibraryId } from "@/lib/services/settings";
import { updateReleaseShelfForKapowarr } from "@/lib/services/coming-soon";
import { runTrackedJob } from "./status";

const SCAN_DEBOUNCE_MS = 30 * 60 * 1000;
const scanKey = "kapowarr:last-komga-scan";
const pendingKey = (libraryId: string) => `kapowarr:pending-komga-scan:${libraryId}`;

export async function scanSelectedLibraryIfDue(now = new Date(), client?: KomgaClient, manual = false): Promise<boolean> {
  if (!env.KOMGA_URL || !env.KOMGA_API_KEY) return false;
  const libraryId = await getSelectedKomgaLibraryId();
  if (!libraryId) return false;
  const last = (await db.select().from(kvCache).where(eq(kvCache.key, scanKey)))[0];
  let lastLibraryId: string | null = null;
  try { lastLibraryId = JSON.parse(last?.valueJson ?? "null")?.libraryId ?? null; } catch { /* Older cache value; do not debounce a different library. */ }
  if (!manual && lastLibraryId === libraryId && last && now.getTime() - Date.parse(last.fetchedAt) < SCAN_DEBOUNCE_MS) return false;
  await (client ?? new KomgaClient({ baseUrl: env.KOMGA_URL, apiKey: env.KOMGA_API_KEY })).scanLibrary(libraryId);
  const fetchedAt = now.toISOString();
  await db.insert(kvCache).values({ key: scanKey, valueJson: JSON.stringify({ libraryId }), fetchedAt, ttlSeconds: 1800 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify({ libraryId }), fetchedAt, ttlSeconds: 1800 } });
  await db.delete(kvCache).where(eq(kvCache.key, pendingKey(libraryId)));
  return true;
}

export async function scanKomgaManually() {
  return runTrackedJob("scan-komga", async () => {
    if (!env.KOMGA_URL || !env.KOMGA_API_KEY) throw new Error("Configure Komga in the deployment settings before scanning.");
    if (!await getSelectedKomgaLibraryId()) throw new Error("Choose a Komga library before scanning.");
    await scanSelectedLibraryIfDue(new Date(), undefined, true);
    return true;
  });
}

export async function checkKapowarr() {
  const result = await runTrackedJob("check-kapowarr", async () => {
    if (!env.KAPOWARR_URL || !env.KAPOWARR_API_KEY) return { checked: 0, scanned: false };
    const missing = await getMissingIssues();
    const missingIds = new Set(missing.map((issue) => issue.seriesId));
    const libraryId = await getSelectedKomgaLibraryId();
    const follows = await db.select().from(followedSeries).where(and(eq(followedSeries.active, true), inArray(followedSeries.matchStatus, ["auto", "confirmed"])));
    let checked = 0;
    for (const follow of follows) {
      if (!follow.kapowarrVolumeId || !missingIds.has(follow.komgaSeriesId)) continue;
      const { previous, current } = await refreshKapowarrStatus(follow.id);
      await updateReleaseShelfForKapowarr(follow.id, previous, current);
      checked += 1;
      if (libraryId && current.state === "files-ready" && (previous?.state !== "files-ready" || current.filesHave > previous.filesHave)) {
        const fetchedAt = new Date().toISOString();
        await db.insert(kvCache).values({ key: pendingKey(libraryId), valueJson: "true", fetchedAt, ttlSeconds: 0 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: "true", fetchedAt } });
      }
    }
    const pending = libraryId && (await db.select().from(kvCache).where(eq(kvCache.key, pendingKey(libraryId))))[0];
    const scanned = pending ? await scanSelectedLibraryIfDue() : false;
    return { checked, scanned };
  });
  // Komga's 202 only accepts the scan. The hourly sync will pick up its completed results.
  return result;
}
