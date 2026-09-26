import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { issues, kvCache } from "@/db/schema";

export function applyImportedSkips(followId: number) {
  db.transaction((tx) => {
    const key = `import:skips:${followId}`;
    const pending = tx.select().from(kvCache).where(eq(kvCache.key, key)).get();
    if (!pending) return;
    const ids = z.array(z.number().int().positive()).parse(JSON.parse(pending.valueJson));
    const remaining = ids.filter((id) => !tx.update(issues).set({ skippedAt: sql`coalesce(${issues.skippedAt}, ${Date.now()})` }).where(and(eq(issues.followedSeriesId, followId), eq(issues.metronIssueId, id))).returning({ id: issues.id }).all().length);
    if (remaining.length) tx.update(kvCache).set({ valueJson: JSON.stringify(remaining) }).where(eq(kvCache.key, key)).run();
    else tx.delete(kvCache).where(eq(kvCache.key, key)).run();
  });
}
