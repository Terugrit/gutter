import { NextResponse } from "next/server";
import { z } from "zod";
import { watchUpcomingRelease } from "@/lib/services/coming-soon";

const input = z.object({ upcoming_release_id: z.number().int().positive(), scope: z.enum(["issue", "series"]) });
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a release and watch scope." }, { status: 400 });
  try {
    const watch = await watchUpcomingRelease(parsed.data.upcoming_release_id, parsed.data.scope);
    return watch ? NextResponse.json({ watch }) : NextResponse.json({ error: "Upcoming release not found." }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Could not follow this release." }, { status: 502 }); }
}
