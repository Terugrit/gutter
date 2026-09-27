import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { followedSeries, issues, kvCache, readingShelf, upcomingReleases } from "@/db/schema";
import { localDate } from "@/jobs/status";
import { excludedIssue } from "./missing";
import { getCachedMetronSeries, getComicVineVolume, getMetronSeries, searchComicVineVolumes, searchMetronSeries } from "./metron";

const recommendationsSchema = z.object({ recommended: z.array(z.object({ id: z.number(), title: z.string(), publisher: z.string(), yearBegan: z.number().nullable().optional(), coverUrl: z.string().optional() }).passthrough()), different: z.array(z.object({ id: z.number(), title: z.string(), publisher: z.string(), yearBegan: z.number().nullable().optional(), coverUrl: z.string().optional() }).passthrough()) });
const poolSchema = z.object({ entries: z.array(z.object({ id: z.number(), title: z.string(), publisher: z.string(), yearBegan: z.number().nullable().optional(), issueCount: z.number().nullable().optional(), coverUrl: z.string().nullable().optional() }).passthrough()) }).passthrough();
const komgaSchema = z.array(z.object({ id: z.string(), t: z.string(), pub: z.string(), seed: z.number(), thumbnail: z.string().optional(), metadata: z.object({ genres: z.array(z.string()).optional(), releaseDate: z.string().optional(), year: z.union([z.string(), z.number()]).optional() }).passthrough().optional() }).passthrough());

export type SeriesOverlayDetail = {
  reference: string;
  komgaSeriesId: string | null;
  metronSeriesId: number | null;
  title: string;
  description: string | null;
  publisher: string | null;
  year: number | null;
  status: "ongoing" | "ended" | null;
  ownedIssues: number;
  totalIssues: number;
  genres: string[];
  nextReleaseDate: string | null;
  followed: boolean;
  onShelf: boolean;
  coverUrl: string | null;
  seed: number;
  kapowarrSent: boolean;
  canSendToKapowarr: boolean;
};

type Reference = { kind: "metron"; id: number } | { kind: "comicvine"; id: number } | { kind: "komga"; id: string };
function parseReference(value: string): Reference | null {
  if (/^\d+$/.test(value)) return { kind: "metron", id: Number(value) };
  const separator = value.indexOf(":");
  if (separator < 1) return { kind: "komga", id: value };
  const kind = value.slice(0, separator);
  const raw = value.slice(separator + 1);
  if ((kind === "metron" || kind === "comicvine") && /^\d+$/.test(raw)) return { kind, id: Number(raw) };
  return kind === "komga" && raw ? { kind, id: raw } : null;
}
async function cacheJson(key: string) {
  const row = (await db.select({ value: kvCache.valueJson }).from(kvCache).where(eq(kvCache.key, key)))[0];
  if (!row) return null;
  try { return JSON.parse(row.value) as unknown; } catch { return null; }
}
function yearFrom(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string") { const match = value.match(/^\d{4}/); if (match) return Number(match[0]); }
  return null;
}
function displayStatus(value?: string | null): "ongoing" | "ended" | null {
  const status = value?.toLowerCase();
  if (status === "completed" || status === "cancelled") return "ended";
  if (status === "ongoing" || status === "continuing" || status === "hiatus") return "ongoing";
  return null;
}
function normalizedTitle(value: string) { return value.toLocaleLowerCase().replace(/[^a-z0-9]/g, ""); }
function decodeHtmlEntity(value: string) {
  const named: Record<string, string> = { amp: "&", apos: "'", gt: ">", hellip: "…", ldquo: "“", lsquo: "‘", mdash: "—", nbsp: " ", ndash: "–", quot: "\"", rdquo: "”", rsquo: "’" };
  if (value[0] !== "#") return named[value] ?? `&${value};`;
  const codePoint = value[1]?.toLowerCase() === "x" ? Number.parseInt(value.slice(2), 16) : Number.parseInt(value.slice(1), 10);
  try { return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : `&${value};`; } catch { return `&${value};`; }
}
function plainComicVineText(value?: string | null) {
  if (!value?.trim()) return null;
  const text = value
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<li\b[^>]*>/gi, "• ")
    .replace(/<(?:br|\/p|\/div|\/li|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (_match, entity: string) => decodeHtmlEntity(entity.toLowerCase()))
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
  return text || null;
}

export async function getSeriesOverlayDetail(value: string): Promise<SeriesOverlayDetail | null> {
  const reference = parseReference(value);
  if (!reference) return null;
  const matchingFollows = reference.kind === "komga"
    ? await db.select().from(followedSeries).where(eq(followedSeries.komgaSeriesId, reference.id))
    : reference.kind === "metron"
      ? await db.select().from(followedSeries).where(eq(followedSeries.metronSeriesId, reference.id))
      : await db.select().from(followedSeries).where(eq(followedSeries.comicvineVolumeId, reference.id));
  const follow = matchingFollows.find((item) => item.active) ?? matchingFollows[0];
  let metronId = reference.kind === "metron" ? reference.id : follow?.metronSeriesId ?? null;
  const localUpcoming = (reference.kind === "comicvine"
    ? await db.select().from(upcomingReleases).where(eq(upcomingReleases.comicvineSeriesId, reference.id))
    : metronId ? await db.select().from(upcomingReleases).where(eq(upcomingReleases.metronSeriesId, metronId)) : [])
    .sort((a, b) => a.expectedReleaseDate.localeCompare(b.expectedReleaseDate));
  if (!metronId && reference.kind === "comicvine") {
    const match = (await searchMetronSeries({ comicVineId: reference.id, maxPages: 1 }))[0];
    metronId = match?.id ?? null;
  }
  const [recommendationsValue, poolValue, komgaValue, shelf] = await Promise.all([
    cacheJson("discover:recommendations"), cacheJson("discover:pool"), cacheJson("komga:series"),
    metronId ? db.select().from(readingShelf).where(eq(readingShelf.metronSeriesId, metronId)) : Promise.resolve([]),
  ]);
  const recommendationSets = recommendationsSchema.safeParse(recommendationsValue).data;
  const recommendation = metronId ? [...(recommendationSets?.recommended ?? []), ...(recommendationSets?.different ?? [])].find((item) => item.id === metronId) : undefined;
  const pool = poolSchema.safeParse(poolValue).data?.entries.find((item) => item.id === metronId);
  const komga = komgaSchema.safeParse(komgaValue).data?.find((item) => item.id === (reference.kind === "komga" ? reference.id : follow?.komgaSeriesId));
  let metron = metronId ? await getCachedMetronSeries(metronId) : null;
  if (metronId && !metron) { try { metron = await getMetronSeries(metronId); } catch { metron = null; } }
  const title = metron?.series ?? follow?.title ?? recommendation?.title ?? pool?.title ?? shelf[0]?.title ?? localUpcoming[0]?.seriesName;
  let comicVineFallback = null;
  let comicVineId = reference.kind === "comicvine" ? reference.id : follow?.comicvineVolumeId ?? metron?.cv_id ?? null;
  if (!comicVineId && title) {
    try {
      const candidates = await searchComicVineVolumes(title);
      const exactTitle = candidates.filter((item) => normalizedTitle(item.name) === normalizedTitle(title));
      const year = metron?.year_began ?? recommendation?.yearBegan ?? pool?.yearBegan ?? shelf[0]?.yearBegan ?? null;
      const publisher = metron?.publisher?.name ?? follow?.publisher ?? recommendation?.publisher ?? pool?.publisher ?? shelf[0]?.publisher ?? null;
      comicVineFallback = exactTitle.find((item) => (!year || item.start_year === String(year)) && (!publisher || !item.publisher?.name || normalizedTitle(item.publisher.name) === normalizedTitle(publisher)))
        ?? exactTitle.find((item) => !year || item.start_year === String(year))
        ?? exactTitle[0]
        ?? candidates[0]
        ?? null;
      comicVineId = comicVineFallback?.id ?? null;
    } catch { comicVineFallback = null; }
  }
  let comicVineDetail = null;
  if (comicVineId) { try { comicVineDetail = await getComicVineVolume(comicVineId); } catch { comicVineDetail = null; } }
  const resolvedTitle = title ?? comicVineDetail?.name ?? comicVineFallback?.name;
  if (!resolvedTitle) return null;
  const cachedIssues = follow ? await db.select().from(issues).where(and(eq(issues.followedSeriesId, follow.id), eq(issues.active, true))).orderBy(asc(issues.storeDate)) : [];
  const eligible = cachedIssues.filter((issue) => !excludedIssue(issue.number, issue.title, issue.skippedAt));
  const today = localDate();
  const released = eligible.filter((issue) => issue.storeDate !== null && issue.storeDate <= today);
  const nextIssue = eligible.find((issue) => issue.storeDate !== null && issue.storeDate > today)?.storeDate ?? localUpcoming.find((item) => item.expectedReleaseDate > today)?.expectedReleaseDate ?? null;
  const genres = metron?.genres?.map((item) => item.name) ?? komga?.metadata?.genres ?? (() => { try { return JSON.parse(localUpcoming[0]?.genresJson ?? "[]") as string[]; } catch { return []; } })();
  const issueCover = cachedIssues.find((issue) => issue.coverUrl)?.coverUrl ?? null;
  return {
    reference: value,
    komgaSeriesId: follow?.komgaSeriesId ?? (reference.kind === "komga" ? reference.id : null),
    metronSeriesId: metronId,
    title: resolvedTitle,
    description: plainComicVineText(comicVineDetail?.description) ?? plainComicVineText(comicVineDetail?.deck),
    publisher: metron?.publisher?.name ?? follow?.publisher ?? recommendation?.publisher ?? pool?.publisher ?? shelf[0]?.publisher ?? localUpcoming[0]?.publisher ?? comicVineFallback?.publisher?.name ?? null,
    year: metron?.year_began ?? recommendation?.yearBegan ?? pool?.yearBegan ?? shelf[0]?.yearBegan ?? yearFrom(komga?.metadata?.releaseDate ?? komga?.metadata?.year) ?? yearFrom(comicVineFallback?.start_year),
    status: displayStatus(metron?.status ?? follow?.seriesStatus),
    ownedIssues: released.filter((issue) => issue.owned).length,
    totalIssues: eligible.length || metron?.issue_count || pool?.issueCount || 0,
    genres,
    nextReleaseDate: nextIssue,
    followed: follow?.active ?? false,
    onShelf: shelf.length > 0,
    coverUrl: issueCover || recommendation?.coverUrl || pool?.coverUrl || shelf[0]?.coverUrl || localUpcoming.find((item) => item.coverUrl)?.coverUrl || komga?.thumbnail || null,
    seed: follow?.id ?? metronId ?? reference.id.toString().split("").reduce((sum, character) => sum + character.charCodeAt(0), 0),
    kapowarrSent: follow?.kapowarrVolumeId !== null && follow?.kapowarrVolumeId !== undefined,
    canSendToKapowarr: Boolean(metronId || follow?.comicvineVolumeId),
  };
}
