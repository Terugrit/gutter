import { NextResponse } from "next/server";
import { dismissFollowSuggestion } from "@/lib/services/follow-suggestions";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  if (!id || id.length > 200) return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  return await dismissFollowSuggestion(id) ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Series not found" }, { status: 404 });
}
