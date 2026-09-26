import { NextResponse } from "next/server";
import { syncKomga } from "@/jobs/sync-komga";
import { refreshReleases } from "@/jobs/refresh-releases";
import { backupDb } from "@/jobs/backup-db";
import { checkKapowarr, scanKomgaManually } from "@/jobs/check-kapowarr";
export async function POST(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const name = (await params).name;
  if (name !== "sync-komga" && name !== "scan-komga" && name !== "refresh-releases" && name !== "backup-db" && name !== "check-kapowarr") return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  try {
    const result = name === "sync-komga" ? await syncKomga() : name === "scan-komga" ? await scanKomgaManually() : name === "backup-db" ? await backupDb() : name === "check-kapowarr" ? await checkKapowarr() : await refreshReleases();
    if (result === null) return NextResponse.json({ error: "This job is already running" }, { status: 409 });
    if (typeof result === "object" && "skipped" in result && result.skipped) return NextResponse.json({ error: "Configure Komga in the deployment settings, then retry." }, { status: 400 });
    return NextResponse.json({ message: name === "scan-komga" ? "Komga file scan requested. New files appear after Komga finishes scanning and Gutter syncs." : name === "backup-db" ? "Database backup saved." : name === "sync-komga" ? "Library synced." : name === "check-kapowarr" ? `Checked ${typeof result === "object" && "checked" in result ? result.checked : 0} Kapowarr volumes.` : `${result} notifications sent. Releases are current.` });
  } catch (error) { const message = error instanceof Error ? error.message : "Job failed"; return NextResponse.json({ error: message }, { status: name === "scan-komga" && /^(Choose a Komga library|Configure Komga)/.test(message) ? 400 : 502 }); }
}
