import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries, issues } from "@/db/schema";

export async function setIssueSkipped(id: number, skipped: boolean) {
  // Only current issues of active follows are editable. Repeated Skip retains its timestamp.
  const result = await db.update(issues).set({ skippedAt: skipped ? sql`coalesce(${issues.skippedAt}, ${Date.now()})` : null })
    .where(and(eq(issues.id, id), eq(issues.active, true), sql`exists (select 1 from ${followedSeries} where ${followedSeries.id} = ${issues.followedSeriesId} and ${followedSeries.active} = 1)`))
    .returning({ id: issues.id, skippedAt: issues.skippedAt });
  return result[0] ?? null;
}
