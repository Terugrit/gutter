import { NextResponse } from "next/server";
import { sendShelfSeriesToKapowarr } from "@/lib/services/reading-shelf";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  try {
    const sent = await sendShelfSeriesToKapowarr(id);
    return sent ? NextResponse.json({ ok: true, ...sent }) : NextResponse.json({ error: "Shelf entry not found" }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not send volume to Kapowarr" }, { status: 502 });
  }
}
