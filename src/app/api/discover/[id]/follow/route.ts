import { NextResponse } from "next/server";
import { followDiscoveredSeries } from "@/lib/services/metron";
import { unfollowSeries } from "@/lib/services/series";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid recommendation" }, { status: 400 });
  try { const follow = await followDiscoveredSeries(id); return NextResponse.json({ ok: true, id: follow.id }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not follow series" }, { status: 502 }); }
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid recommendation" }, { status: 400 });
  await unfollowSeries(`discover:${id}`);
  return NextResponse.json({ ok: true });
}

