import { NextResponse } from "next/server";
import { z } from "zod";
import { dismissUpcomingSeries } from "@/lib/services/coming-soon";

const input = z.object({ metron_series_id: z.number().int().positive().optional(), comicvine_series_id: z.number().int().positive().optional() }).refine((value) => value.metron_series_id || value.comicvine_series_id);
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid series." }, { status: 400 });
  return NextResponse.json({ ok: await dismissUpcomingSeries({ metronSeriesId: parsed.data.metron_series_id, comicvineSeriesId: parsed.data.comicvine_series_id }) });
}
