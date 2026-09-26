import { eq } from "drizzle-orm";
import { db } from "@/db";
import { kvCache } from "@/db/schema";
import { env } from "@/env";

export type ServiceSetting = { name: string; url: string; configured: boolean };
export type SelectedKomgaLibrary = { id: string; name: string };
export async function getServices(): Promise<ServiceSetting[]> {
  return [
    { name: "Komga", url: env.KOMGA_URL || "Not configured", configured: Boolean(env.KOMGA_URL && env.KOMGA_API_KEY) },
    { name: "Metron", url: "https://metron.cloud", configured: Boolean(env.METRON_USER && env.METRON_PASSWORD) },
    { name: "ComicVine", url: "https://comicvine.gamespot.com", configured: Boolean(env.COMICVINE_API_KEY) },
    { name: "Kapowarr", url: env.KAPOWARR_URL || "Not configured", configured: Boolean(env.KAPOWARR_URL && env.KAPOWARR_API_KEY) },
    { name: "ntfy", url: env.NTFY_URL && env.NTFY_TOPIC ? `${env.NTFY_URL.replace(/\/$/, "")}/${env.NTFY_TOPIC}` : "Not configured", configured: Boolean(env.NTFY_URL && env.NTFY_TOPIC) },
  ];
}
export async function getSelectedKomgaLibrary(): Promise<SelectedKomgaLibrary | null> {
  const selection = (await db.select().from(kvCache).where(eq(kvCache.key, "settings:komga-library")))[0];
  if (!selection) return null;
  try {
    const value = JSON.parse(selection.valueJson) as unknown;
    if (typeof value === "string") return { id: value, name: value };
    if (typeof value === "object" && value !== null && "id" in value && "name" in value && typeof value.id === "string" && typeof value.name === "string") return { id: value.id, name: value.name };
    return null;
  } catch { return null; }
}
export async function getSelectedKomgaLibraryId() { return (await getSelectedKomgaLibrary())?.id ?? null; }
export async function saveSelectedKomgaLibrary(library: SelectedKomgaLibrary) {
  const previous = await getSelectedKomgaLibraryId();
  if (previous !== library.id) await db.delete(kvCache).where(eq(kvCache.key, `komga:ownership-baseline:${library.id}`));
  const fetchedAt = new Date().toISOString();
  await db.insert(kvCache).values({ key: "settings:komga-library", valueJson: JSON.stringify(library), fetchedAt, ttlSeconds: 365 * 24 * 60 * 60 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(library), fetchedAt, ttlSeconds: 365 * 24 * 60 * 60 } });
}
export async function getOperations() {
  const names = ["sync-komga", "scan-komga", "refresh-releases", "weekly-digest", "refresh-discover", "backup-db", "check-kapowarr"] as const;
  const statuses = await Promise.all(names.map(async (name) => {
    const row = (await db.select().from(kvCache).where(eq(kvCache.key, `job:${name}`)))[0];
    try { return [name, row ? JSON.parse(row.valueJson) : null] as const; } catch { return [name, null] as const; }
  }));
  const freshness = await Promise.all(["komga:series", "komga:books", "discover:recommendations"].map(async (key) => {
    const row = (await db.select({ fetchedAt: kvCache.fetchedAt }).from(kvCache).where(eq(kvCache.key, key)))[0];
    return [key, row?.fetchedAt ?? null] as const;
  }));
  return { jobs: Object.fromEntries(statuses) as Record<string, { state: string; lastSuccessAt?: string; error?: string } | null>, freshness: Object.fromEntries(freshness) as Record<string, string | null> };
}
