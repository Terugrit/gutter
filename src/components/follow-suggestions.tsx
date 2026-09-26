"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Cover } from "@/components/cover";
import { useToast } from "@/components/toast";
import type { FollowSuggestion } from "@/lib/services/follow-suggestions";

export function FollowSuggestions({ initial, onFollow }: { initial: FollowSuggestion[]; onFollow?: (id: string) => void }) {
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const toast = useToast();
  const router = useRouter();
  if (!items.length) return null;
  async function action(item: FollowSuggestion, follow: boolean) {
    setBusyId(item.id);
    try {
      const response = await fetch(follow ? "/api/follows" : `/api/follow-suggestions/${encodeURIComponent(item.id)}/dismiss`, { method: "POST", ...(follow ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ series: [{ id: item.id, title: item.title, publisher: item.publisher }] }) } : {}) });
      if (!response.ok) throw new Error();
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (follow) { onFollow?.(item.id); toast(`Following ${item.title}`); router.refresh(); }
      else { toast(`Dismissed ${item.title}`); router.refresh(); }
    } catch { toast(follow ? "Could not follow series. Retry from Library." : "Could not dismiss suggestion. Retry."); }
    finally { setBusyId(null); }
  }
  return <section className="sec follow-suggestions" style={{ margin: "24px 0 32px" }}><header><h2>Reading, not following</h2></header><div className="strip">{items.map((item) => <figure key={item.id}><Cover src={item.thumbnail} seed={item.seed} title={item.title} /><figcaption>{item.title}<span>{item.publisher}</span><button disabled={busyId !== null} onClick={() => void action(item, true)}>{busyId === item.id ? "Saving…" : "Follow"}</button><button disabled={busyId !== null} onClick={() => void action(item, false)}>Dismiss</button></figcaption></figure>)}</div></section>;
}
