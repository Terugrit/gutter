"use client";
import { useState } from "react";
import { useToast } from "./toast";

type Action = "follow" | "kapowarr" | "dismiss";

export function RecommendationActions({ id, title, onComplete, dismissible = false }: {
  id: number;
  title: string;
  onComplete: (action: Action) => void;
  dismissible?: boolean;
}) {
  const [pending, setPending] = useState<Action | null>(null);
  const toast = useToast();
  const run = async (action: Action) => {
    setPending(action);
    try {
      const response = await fetch(`/api/discover/${id}/${action === "kapowarr" ? "kapowarr" : action === "dismiss" ? "dismiss" : "follow"}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Request failed");
      }
      onComplete(action);
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
    <button className="lnk" disabled={pending !== null} aria-label={`Download ${title} volume with Kapowarr`} title="Follow and send volume to Kapowarr" onClick={() => void run("kapowarr")}>{pending === "kapowarr" ? "Sending…" : "Download volume"}</button>
    {dismissible ? <button className="lnk" disabled={pending !== null} onClick={() => void run("dismiss")}>{pending === "dismiss" ? "Dismissing…" : "Dismiss"}</button> : null}
  </div>;
}
