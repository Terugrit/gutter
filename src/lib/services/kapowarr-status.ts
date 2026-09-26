import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { KapowarrClient } from "@/clients/kapowarr/client";
import { db } from "@/db";
import { followedSeries, kvCache } from "@/db/schema";
import { env } from "@/env";

export const kapowarrStatusSchema = z.object({ state: z.enum(["idle", "downloading", "files-ready"]), queued: z.number().int().nonnegative(), filesHave: z.number().int().nonnegative(), filesTotal: z.number().int().nonnegative() });
export type KapowarrStatus = z.infer<typeof kapowarrStatusSchema>;
const key = (followId: number) => `kapowarr:status:${followId}`;
const STATUS_TTL_SECONDS = 1800;

export async function getKapowarrStatus(followId: number): Promise<KapowarrStatus | null> {
  const row = (await db.select().from(kvCache).where(eq(kvCache.key, key(followId))))[0];
  if (!row) return null;
  if (Date.now() - Date.parse(row.fetchedAt) > row.ttlSeconds * 1000) return null;
  try { const parsed = kapowarrStatusSchema.safeParse(JSON.parse(row.valueJson)); return parsed.success ? parsed.data : null; }
  catch { return null; }
}

export async function refreshKapowarrStatus(followId: number, client?: KapowarrClient): Promise<{ previous: KapowarrStatus | null; current: KapowarrStatus }> {
  const follow = (await db.select().from(followedSeries).where(and(eq(followedSeries.id, followId), eq(followedSeries.active, true))))[0];
  if (!follow?.kapowarrVolumeId) throw new Error("Kapowarr volume not found for this follow");
  if (!client && (!env.KAPOWARR_URL || !env.KAPOWARR_API_KEY)) throw new Error("Kapowarr is not configured");
  const api = client ?? new KapowarrClient({ baseUrl: env.KAPOWARR_URL!, apiKey: env.KAPOWARR_API_KEY! });
  // The UI cache expires; transition detection must retain the last observation across polls/restarts.
  const [volume, queue, previousRow] = await Promise.all([api.getVolume(follow.kapowarrVolumeId), api.getDownloadQueue(), db.select().from(kvCache).where(eq(kvCache.key, key(followId)))]);
  let previous: KapowarrStatus | null = null;
  try { previous = kapowarrStatusSchema.parse(JSON.parse(previousRow[0]?.valueJson ?? "null")); } catch { /* No earlier observation. */ }
  const queued = queue.filter((entry) => entry.volume_id === follow.kapowarrVolumeId).length;
  const filesHave = volume.issues_downloaded;
  const current: KapowarrStatus = { state: queued ? "downloading" : filesHave ? "files-ready" : "idle", queued, filesHave, filesTotal: volume.issue_count };
  const fetchedAt = new Date().toISOString();
  await db.insert(kvCache).values({ key: key(followId), valueJson: JSON.stringify(current), fetchedAt, ttlSeconds: STATUS_TTL_SECONDS }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(current), fetchedAt, ttlSeconds: STATUS_TTL_SECONDS } });
  return { previous, current };
}
