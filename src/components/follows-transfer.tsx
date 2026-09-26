"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./toast";

export function FollowsTransfer() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter(); const toast = useToast();
  async function upload(file: File) {
    setBusy(true); setMessage("Importing follows…");
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error("Follows file must be smaller than 5 MB.");
      const response = await fetch("/api/import/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: file });
      const result = await response.json() as { error?: string; message?: string };
      if (!response.ok) throw new Error(result.error ?? "Import failed. Retry the same file.");
      const summary = result.message ?? "Follows imported.";
      setMessage(summary); toast(summary); router.refresh();
    } catch (error) { const text = error instanceof Error ? error.message : "Import failed. Retry the same file."; setMessage(text); toast(text); }
    finally { setBusy(false); }
  }
  return <section className="sec"><header><h2>Follows</h2><a href="/api/export/follows" download>Download follows</a></header>
    <p className="muted">Import adds or reactivates follows and restores skipped issues. Existing follows are kept.</p>
    <div className="tools"><label htmlFor="follows-file">Import follows</label><input id="follows-file" type="file" accept=".json,application/json" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void upload(file); }} /></div>
    {message ? <p className="muted" role="status">{message}</p> : null}
  </section>;
}
