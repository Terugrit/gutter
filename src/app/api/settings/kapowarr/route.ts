import { NextResponse } from "next/server";
import { KapowarrClient } from "@/clients/kapowarr/client";
import { env } from "@/env";

export async function POST() {
  if (!env.KAPOWARR_URL || !env.KAPOWARR_API_KEY) return NextResponse.json({ message: "○ Not configured" }, { status: 400 });
  try { await new KapowarrClient({ baseUrl: env.KAPOWARR_URL, apiKey: env.KAPOWARR_API_KEY }).status(); return NextResponse.json({ message: "● Connected" }); }
  catch (error) { return NextResponse.json({ message: `○ Not reachable: ${error instanceof Error ? error.message : "Request failed"}` }, { status: 502 }); }
}
