import { NextResponse } from "next/server";
import { z } from "zod";
import { addInterestFilter, getInterestFilters } from "@/lib/services/coming-soon";

const input = z.object({ kind: z.enum(["publisher", "genre"]), value: z.string().trim().min(1).max(200) });
export async function GET() { return NextResponse.json({ filters: await getInterestFilters() }); }
export async function POST(request: Request) {
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Choose a publisher or genre." }, { status: 400 });
  return NextResponse.json({ filter: await addInterestFilter(parsed.data.kind, parsed.data.value) });
}
