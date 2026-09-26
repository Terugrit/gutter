import { NextResponse } from "next/server";
import { NtfyClient } from "@/clients/ntfy/client";
import { env } from "@/env";

export async function POST() {
  if (!env.NTFY_URL || !env.NTFY_TOPIC) return NextResponse.json({ message: "○ Not configured" }, { status: 400 });
  try {
    await new NtfyClient({ baseUrl: env.NTFY_URL, topic: env.NTFY_TOPIC, token: env.NTFY_TOKEN }).publish({ title: "Gutter connection test", body: "ntfy is connected to Gutter." });
    return NextResponse.json({ message: "● Connected" });
  } catch (error) { return NextResponse.json({ message: `○ Not reachable: ${error instanceof Error ? error.message : "Request failed"}` }, { status: 502 }); }
}
