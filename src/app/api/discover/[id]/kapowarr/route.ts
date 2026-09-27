import { NextResponse } from "next/server";
import { followDiscoveredSeries } from "@/lib/services/metron";
import { sendSeriesToKapowarr } from "@/lib/services/kapowarr";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid recommendation" }, { status: 400 });
  try {
    const follow = await followDiscoveredSeries(id);
    return NextResponse.json({ ok: true, ...(await sendSeriesToKapowarr(follow.komgaSeriesId)) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send volume to Kapowarr" }, { status: 502 });
  }
}
