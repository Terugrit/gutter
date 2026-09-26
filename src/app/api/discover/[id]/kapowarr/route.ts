import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { followedSeries } from "@/db/schema";
import { getRecommendations } from "@/lib/services/recommendations";
import { followDiscoveredSeries } from "@/lib/services/metron";
import { sendSeriesToKapowarr } from "@/lib/services/kapowarr";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid recommendation" }, { status: 400 });
  const sets = await getRecommendations();
  const visible = [...sets.recommended, ...sets.different].some((item) => item.id === id);
  const existing = (await db.select().from(followedSeries).where(eq(followedSeries.metronSeriesId, id)))[0];
  if (!visible && !existing?.active) return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
  try {
    const follow = await followDiscoveredSeries(id);
    return NextResponse.json({ ok: true, ...(await sendSeriesToKapowarr(follow.komgaSeriesId)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send volume to Kapowarr" }, { status: 502 });
  }
}
