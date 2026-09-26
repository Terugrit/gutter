import { NextResponse } from "next/server";
import { sendSeriesToKapowarr } from "@/lib/services/kapowarr";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await sendSeriesToKapowarr(decodeURIComponent((await params).id))); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Kapowarr request failed" }, { status: 502 }); }
}

