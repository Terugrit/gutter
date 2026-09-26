import { NextResponse } from "next/server";
import { getRecommendations } from "@/lib/services/recommendations";
import { followDiscoveredSeries } from "@/lib/services/metron";
import { unfollowSeries } from "@/lib/services/series";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid recommendation" }, { status: 400 });
  const sets = await getRecommendations();
  if (![...(sets?.recommended ?? []), ...(sets?.different ?? [])].some((item) => item.id === id)) return NextResponse.json({ error: "Recommendation not found" }, { status: 404 });
  try { const follow = await followDiscoveredSeries(id); return NextResponse.json({ ok: true, id: follow.id }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not follow series" }, { status: 502 }); }
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid recommendation" }, { status: 400 });
  await unfollowSeries(`discover:${id}`);
  return NextResponse.json({ ok: true });
}

