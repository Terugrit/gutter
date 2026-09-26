import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { followedSeries, issues, notifications } from "@/db/schema";
import { sendSeriesToKapowarr } from "@/lib/services/kapowarr";
import { authorizedAction } from "../verify";

export async function POST(request: Request) {
  const auth = await authorizedAction(request, "send-kapowarr");
  if (auth.error) return auth.error;
  const row = (await db.select({ seriesId: followedSeries.komgaSeriesId, active: followedSeries.active, matchStatus: followedSeries.matchStatus, comicVineVolumeId: followedSeries.comicvineVolumeId }).from(notifications).innerJoin(issues, eq(notifications.issueId, issues.id)).innerJoin(followedSeries, eq(issues.followedSeriesId, followedSeries.id)).where(and(eq(notifications.id, auth.notificationId!), eq(notifications.type, "new_release"))))[0];
  if (!row || !row.active || !["auto", "confirmed"].includes(row.matchStatus) || !row.comicVineVolumeId) return NextResponse.json({}, { status: 403 });
  try { await sendSeriesToKapowarr(row.seriesId); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: "Kapowarr send failed" }, { status: 502 }); }
}
