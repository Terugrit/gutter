import { NextResponse } from "next/server";
import { ComicVineClient } from "@/clients/comicvine/client";
import { env } from "@/env";

export async function POST() {
  if (!env.COMICVINE_API_KEY) return NextResponse.json({ message: "○ Not configured" }, { status: 400 });
  try { await new ComicVineClient({ apiKey: env.COMICVINE_API_KEY }).searchVolumes("Batman"); return NextResponse.json({ message: "● Connected" }); }
  catch (error) { return NextResponse.json({ message: `○ Not reachable: ${error instanceof Error ? error.message : "Request failed"}` }, { status: 502 }); }
}
