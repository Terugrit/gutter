import { NextResponse } from "next/server";
import { dismissRecommendation } from "@/lib/services/recommendations";

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Invalid recommendation" }, { status: 400 });
  await dismissRecommendation(id);
  return NextResponse.json({ ok: true });
}
