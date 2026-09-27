"use client";
import { useState } from "react";
import { useToast } from "./toast";

type Action = "follow" | "kapowarr" | "dismiss" | "save";

export function RecommendationActions({ id, title, onComplete, dismissible = false, saved = false }: {
  id: number;
  title: string;
  onComplete: (action: Action) => void;
  dismissible?: boolean;
  saved?: boolean;
}) {
  const [pending, setPending] = useState<Action | null>(null);
  const [onShelf, setOnShelf] = useState(saved);
  const toast = useToast();
  const run = async (action: Action) => {
    setPending(action);
    try {
      const response = action === "save"
        ? await fetch("/api/shelf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) })
        : await fetch(`/api/discover/${id}/${action === "kapowarr" ? "kapowarr" : action === "dismiss" ? "dismiss" : "follow"}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Request failed");
      }
      onComplete(action);
      if (action === "save") { setOnShelf(true); toast("Saved to shelf"); }
      if (action === "follow") toast(`Following ${title}`);
      if (action === "kapowarr") toast(`Following ${title}; volume sent to Kapowarr`);
    } catch (error) {
      toast(error instanceof Error ? error.message : `Could not update ${title}`);
    } finally {
      setPending(null);
    }
  };
  return <div className="rec-actions">
    <button className="lnk" disabled={pending !== null} onClick={() => void run("follow")}>{pending === "follow" ? "Following…" : "Follow"}</button>
    <button className="lnk" disabled={pending !== null || onShelf} onClick={() => void run("save")}>{onShelf ? "On shelf" : pending === "save" ? "Saving…" : "Save to shelf"}</button>
    <button className="lnk" disabled={pending !== null} aria-label={`Download ${title} volume with Kapowarr`} title="Follow and send volume to Kapowarr" onClick={() => void run("kapowarr")}>{pending === "kapowarr" ? "Sending…" : "Download volume"}</button>
    {dismissible ? <button className="lnk" disabled={pending !== null} onClick={() => void run("dismiss")}>{pending === "dismiss" ? "Dismissing…" : "Dismiss"}</button> : null}
  </div>;
}
