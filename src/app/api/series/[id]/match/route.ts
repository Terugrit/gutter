import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { followedSeries } from "@/db/schema";
import { candidatesForSeries, confirmMatch } from "@/lib/services/metron";
import { eq } from "drizzle-orm";

const input = z.object({ query: z.string().trim().min(1).optional(), metronSeriesId: z.number().int().positive().optional() });
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const parsed = input.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid match request" }, { status: 400 });
  const id = decodeURIComponent((await params).id);
  const follow = (await db.select().from(followedSeries).where(eq(followedSeries.komgaSeriesId, id)))[0];
  if (!follow) return NextResponse.json({ error: "Followed series not found" }, { status: 404 });
  try {
    if (parsed.data.metronSeriesId) return NextResponse.json({ selected: await confirmMatch(id, parsed.data.metronSeriesId) });
    const candidates = await candidatesForSeries({ title: parsed.data.query ?? follow.title, publisher: follow.publisher });
    return NextResponse.json({ candidates: candidates.map(({ score: _score, ...candidate }) => candidate) });
  } catch { return NextResponse.json({ error: "Metron is not reachable. Check its credentials in the deployment settings." }, { status: 502 }); }
}

