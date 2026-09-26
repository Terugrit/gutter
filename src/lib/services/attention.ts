import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries } from "@/db/schema";

export async function getAttentionCount() {
  const [row] = await db.select({ count: sql<number>`count(*)` }).from(followedSeries).where(and(eq(followedSeries.active, true), ne(followedSeries.matchStatus, "auto"), ne(followedSeries.matchStatus, "confirmed")));
  return row?.count ?? 0;
}
