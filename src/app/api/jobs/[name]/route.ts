import { NextResponse } from "next/server";
import { syncKomga } from "@/jobs/sync-komga";
import { refreshReleases } from "@/jobs/refresh-releases";
import { backupDb } from "@/jobs/backup-db";
export async function POST(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (name !== "sync-komga" && name !== "refresh-releases" && name !== "backup-db") return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  try {
    const result = name === "sync-komga" ? await syncKomga() : name === "backup-db" ? await backupDb() : await refreshReleases();
    if (result === null) return NextResponse.json({ error: "This job is already running" }, { status: 409 });
    if (typeof result === "object" && "skipped" in result && result.skipped) return NextResponse.json({ error: "Configure Komga in .env, then retry." }, { status: 400 });
    return NextResponse.json({ message: name === "backup-db" ? "Database backup saved." : name === "sync-komga" ? "Library synced." : `${result} notifications sent. Releases are current.` });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Job failed" }, { status: 502 }); }
}
