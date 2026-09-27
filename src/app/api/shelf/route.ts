import { NextResponse } from "next/server";
import { z } from "zod";
import { saveToReadingShelf } from "@/lib/services/reading-shelf";

const input = z.object({ id: z.number().int().positive() });

export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  const saved = await saveToReadingShelf(parsed.data.id);
  if (!saved) return NextResponse.json({ error: "Recommendation is no longer available" }, { status: 404 });
  return NextResponse.json({ ok: true, id: saved.metronSeriesId });
}
