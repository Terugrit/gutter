import { eq } from "drizzle-orm";
import { KapowarrClient } from "@/clients/kapowarr/client";
import { db } from "@/db";
import { followedSeries } from "@/db/schema";
import { env } from "@/env";

export async function sendSeriesToKapowarr(komgaSeriesId: string) {
  const follow = (await db.select().from(followedSeries).where(eq(followedSeries.komgaSeriesId, komgaSeriesId)))[0];
  if (!follow) throw new Error("Followed series not found");
  if (!follow.comicvineVolumeId) throw new Error("Choose a match with a ComicVine volume before sending to Kapowarr");
  if (!env.KAPOWARR_URL || !env.KAPOWARR_API_KEY) throw new Error("Kapowarr is not configured");
  const kapowarr = new KapowarrClient({ baseUrl: env.KAPOWARR_URL, apiKey: env.KAPOWARR_API_KEY });
  const added = await kapowarr.addVolume(follow.comicvineVolumeId);
  await kapowarr.triggerSearch(added.volume.id);
  await db.update(followedSeries).set({ kapowarrVolumeId: added.volume.id }).where(eq(followedSeries.id, follow.id));
  return { volumeId: added.volume.id, existing: added.existing };
}
