import { NextResponse } from "next/server";
import { z } from "zod";
import { addManualUpcomingRelease } from "@/lib/services/coming-soon";

const input = z.object({ metron_series_id: z.number().int().positive() });
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Metron series." }, { status: 400 });
  try {
    const release = await addManualUpcomingRelease(parsed.data.metron_series_id);
    return release ? NextResponse.json({ release }) : NextResponse.json({ error: "No upcoming dated issue was found for this series." }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not add this series." }, { status: 502 }); }
}
