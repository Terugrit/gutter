import { NextResponse } from "next/server";
import { MetronClient } from "@/clients/metron/client";
import { env } from "@/env";

export async function POST() {
  if (!env.METRON_USER || !env.METRON_PASSWORD) return NextResponse.json({ message: "○ Not configured" }, { status: 400 });
  try { await new MetronClient({ username: env.METRON_USER, password: env.METRON_PASSWORD }).searchSeries({ name: "a" }); return NextResponse.json({ message: "● Connected" }); }
  catch (error) { return NextResponse.json({ message: `○ Not reachable: ${error instanceof Error ? error.message : "Request failed"}` }, { status: 502 }); }
}
