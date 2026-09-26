import { KomgaClient } from "@/clients/komga/client";
import { db } from "@/db";
import { kvCache } from "@/db/schema";
import { env } from "@/env";
import { getSelectedKomgaLibraryId } from "@/lib/services/settings";
import { applyKomgaOwnership, reconcileDiscoverFollows } from "@/lib/services/library";
import { runTrackedJob } from "./status";

export async function syncKomga() { return runTrackedJob("sync-komga", doSyncKomga); }
async function doSyncKomga() {
  if (!env.KOMGA_URL || !env.KOMGA_API_KEY) return { skipped: true, series: 0, books: 0 };
  const client = new KomgaClient({ baseUrl: env.KOMGA_URL, apiKey: env.KOMGA_API_KEY });
  const libraryId = await getSelectedKomgaLibraryId();
  const [series, books] = await Promise.all([client.listSeries(libraryId ?? undefined), client.listBooks(libraryId ?? undefined)]);
  const librarySeries = series.map((item, index) => ({ id: item.id, t: item.metadata?.title || item.name, pub: item.metadata?.publisher || "Unknown publisher", seed: index + 1, thumbnail: client.thumbnailPath(item.id), metadata: item.metadata }));
  const now = new Date().toISOString();
  for (const [key, source] of [["komga:series", librarySeries], ["komga:books", books]] as const) {
    const valueJson = JSON.stringify(source);
    await db.insert(kvCache).values({ key, valueJson, fetchedAt: now, ttlSeconds: 3600 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson, fetchedAt: now, ttlSeconds: 3600 } });
  }
  await reconcileDiscoverFollows(librarySeries);
  await applyKomgaOwnership();
  return { skipped: false, series: series.length, books: books.length };
}
