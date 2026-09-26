import { NextResponse } from "next/server";
import { refreshDiscover } from "@/lib/services/recommendations";
import { z } from "zod";

const input = z.object({ scope: z.enum(["recommended", "different"]).optional() });
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid refresh scope." }, { status: 400 });
  try { return NextResponse.json(await refreshDiscover(parsed.data.scope ?? "all")); }
  catch { return NextResponse.json({ error: "Recommendations could not be refreshed." }, { status: 503 }); }
}
