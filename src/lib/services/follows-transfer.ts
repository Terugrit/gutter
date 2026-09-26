import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries, issues, kvCache } from "@/db/schema";
import { serializeOperation } from "@/jobs/status";
import { applyImportedSkips } from "./import-skips";
import { cacheIssues } from "./metron";
import { applyKomgaOwnership } from "./library";

const id = z.number().int().positive().safe();
const followSchema = z.object({
  komga_series_id: z.string().min(1).max(256), title: z.string().min(1).max(1000), publisher: z.string().max(1000).nullable().default(null),
  metron_series_id: id.nullable(), comicvine_volume_id: id.nullable(), kapowarr_volume_id: id.nullable(),
  match_status: z.enum(["auto", "confirmed", "unmatched"]), monitor_mode: z.enum(["future_only", "all"]), active: z.boolean(),
  created_at: z.string().datetime().optional(), skipped_metron_issue_ids: z.array(id).max(100000),
}).strict().superRefine((value, context) => {
  if ((value.match_status !== "unmatched") !== (value.metron_series_id !== null)) context.addIssue({ code: "custom", message: "Matched follows require a Metron ID; unmatched follows must have none." });
  if (value.komga_series_id.startsWith("discover:") && value.komga_series_id !== `discover:${value.metron_series_id}`) context.addIssue({ code: "custom", message: "Discover ID must match the Metron series ID." });
});
export const followsExportSchema = z.object({ version: z.literal(1), follows: z.array(followSchema).max(10000) }).strict().superRefine((value, context) => {
  if (new Set(value.follows.map((follow) => follow.komga_series_id)).size !== value.follows.length) context.addIssue({ code: "custom", message: "Duplicate Komga series IDs." });
});
export async function exportFollows() {
  return serializeOperation(async () => {
    const follows = await db.select().from(followedSeries);
    const allIssues = await db.select().from(issues);
    const pending = await db.select().from(kvCache);
    return { version: 1 as const, follows: follows.map((follow) => ({
      komga_series_id: follow.komgaSeriesId, title: follow.title, publisher: follow.publisher,
      metron_series_id: follow.metronSeriesId, comicvine_volume_id: follow.comicvineVolumeId, kapowarr_volume_id: follow.kapowarrVolumeId,
      match_status: follow.matchStatus, monitor_mode: follow.monitorMode, active: follow.active, created_at: z.string().datetime().safeParse(follow.createdAt).success ? follow.createdAt : undefined,
      skipped_metron_issue_ids: [...new Set([...allIssues.filter((issue) => issue.followedSeriesId === follow.id && issue.skippedAt !== null).map((issue) => issue.metronIssueId),
        ...z.array(id).parse(JSON.parse(pending.find((row) => row.key === `import:skips:${follow.id}`)?.valueJson ?? "[]"))])],
    })) };
  });
}
export async function importFollows(input: unknown) {
  const data = followsExportSchema.parse(input);
  return serializeOperation(async () => {
    const importedIds: number[] = [];
    const result = { imported: 0, refreshed: 0, pending: 0 };
    for (const item of data.follows) {
      const follow = db.transaction((tx) => {
        const old = tx.select().from(followedSeries).where(eq(followedSeries.komgaSeriesId, item.komga_series_id)).get();
        if (old && old.metronSeriesId !== item.metron_series_id) tx.update(issues).set({ active: false }).where(eq(issues.followedSeriesId, old.id)).run();
        const values = { komgaSeriesId: item.komga_series_id, title: item.title, publisher: item.publisher, metronSeriesId: item.metron_series_id, comicvineVolumeId: item.comicvine_volume_id, kapowarrVolumeId: item.kapowarr_volume_id, matchStatus: item.match_status, monitorMode: item.monitor_mode, active: true, createdAt: item.created_at ?? old?.createdAt ?? new Date().toISOString(), seriesStatus: old?.metronSeriesId === item.metron_series_id ? old.seriesStatus : null };
        const row = tx.insert(followedSeries).values(values).onConflictDoUpdate({ target: followedSeries.komgaSeriesId, set: values }).returning().get();
        const key = `import:skips:${row.id}`;
        const previous = tx.select().from(kvCache).where(eq(kvCache.key, key)).get();
        const skipped = [...new Set([...z.array(id).parse(JSON.parse(previous?.valueJson ?? "[]")), ...item.skipped_metron_issue_ids])];
        tx.insert(kvCache).values({ key, valueJson: JSON.stringify(skipped), fetchedAt: new Date().toISOString(), ttlSeconds: 0 }).onConflictDoUpdate({ target: kvCache.key, set: { valueJson: JSON.stringify(skipped) } }).run();
        return row;
      });
      importedIds.push(follow.id);
      applyImportedSkips(follow.id);
      result.imported++;
      if (follow.metronSeriesId && follow.matchStatus !== "unmatched") {
        try { if (await cacheIssues(follow.id, follow.metronSeriesId)) result.refreshed++; else result.pending++; }
        catch { result.pending++; }
      }
    }
    await applyKomgaOwnership(importedIds);
    return result;
  });
}
