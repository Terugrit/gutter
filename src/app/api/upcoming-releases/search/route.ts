import { NextResponse } from "next/server";
import { searchUpcomingSeries } from "@/lib/services/coming-soon";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 200) return NextResponse.json({ error: "Enter at least two characters." }, { status: 400 });
  try { return NextResponse.json({ results: await searchUpcomingSeries(query) }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Search failed." }, { status: 502 }); }
}
