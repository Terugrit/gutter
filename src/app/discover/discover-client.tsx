"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Cover } from "@/components/cover";
import { RecommendationActions } from "@/components/recommendation-actions";
import { useToast } from "@/components/toast";
import { useListNavigation } from "@/components/use-list-navigation";
import { reasonText, type RecommendationReason } from "@/lib/recommendation-ranking";

type Recommendation = { id: number; title: string; publisher: string; reason?: string; why?: RecommendationReason; coverUrl: string };
type Sets = { recommended: Recommendation[]; different: Recommendation[] };

export function DiscoverClient({ data }: { data: Sets }) {
  const [sets, setSets] = useState(data);
  const [preview, setPreview] = useState<{ title: string; seed: number; coverUrl: string; why?: RecommendationReason } | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const all = [...sets.recommended, ...sets.different];
  const open = useCallback((index: number) => { document.querySelector<HTMLElement>(`[data-list-nav="${index}"] .rec-actions button`)?.focus(); }, []);
  const { containerRef, selectedIndex } = useListNavigation({ count: all.length, onOpen: open });
  useEffect(() => {
    const item = selectedIndex < sets.recommended.length ? sets.recommended[selectedIndex] : sets.different[selectedIndex - sets.recommended.length];
    if (item) setPreview({ title: item.title, coverUrl: item.coverUrl, why: item.why, seed: selectedIndex < sets.recommended.length ? selectedIndex + 2 : selectedIndex - sets.recommended.length + 5 });
  }, [selectedIndex, sets.recommended.length, sets.recommended, sets.different]);
  const refresh = async (scope: "recommended" | "different") => {
    setBusy(true);
    try {
      const response = await fetch("/api/discover/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope }) });
      if (!response.ok) throw new Error();
      const next = await response.json() as Sets;
      const changed = next[scope].map((item) => item.id).join(",") !== sets[scope].map((item) => item.id).join(",");
      setSets(next);
      toast(changed ? "Recommendations refreshed" : "No new recommendations available");
    } catch { toast("Recommendations could not be refreshed"); }
    finally { setBusy(false); }
  };
  const remove = (item: Recommendation) => {
    setSets((current) => ({ recommended: current.recommended.filter((candidate) => candidate.id !== item.id), different: current.different.filter((candidate) => candidate.id !== item.id) }));
    if (preview?.title === item.title) setPreview(null);
  };
  const list = (items: Recommendation[], offset: number, navOffset: number) => items.length ? items.map((item, index) => <DiscoverRow item={item} number={index + 1} seed={index + offset} navigationIndex={index + navOffset} selected={selectedIndex === index + navOffset} key={item.id} onHover={() => setPreview({ title: item.title, seed: index + offset, coverUrl: item.coverUrl, why: item.why })} onComplete={() => remove(item)} />) : <p className="muted">No recommendations available. Connect and sync Komga and Metron, then refresh.</p>;
  if (!sets.recommended.length && !sets.different.length) return <div className="page"><h1 className="title">Discover</h1><h2 className="title">Nothing to discover yet.</h2><Link href="/settings">Connect Komga and Metron</Link><div className="tools"><button disabled={busy} onClick={() => void refresh("different")}>{busy ? "Refreshing…" : "Refresh"}</button></div></div>;
  return <div className="page"><h1 className="title">Discover</h1><div className="disc" ref={containerRef}><div><section className="sec" style={{ marginTop: 24 }}><header><h2>Recommended for you</h2><button disabled={busy} onClick={() => void refresh("recommended")}>{busy ? "Refreshing…" : "Refresh"}</button></header>{list(sets.recommended, 2, 0)}</section><section className="sec"><header><h2>Something different</h2><button disabled={busy} onClick={() => void refresh("different")}>{busy ? "Refreshing…" : "Refresh"}</button></header>{list(sets.different, 5, sets.recommended.length)}</section></div><aside className="preview" aria-hidden="true">{preview ? <Cover src={preview.coverUrl} seed={preview.seed} title={preview.title} /> : <div className="cv" />}<p>{preview?.title ?? "Hover a row to preview its cover."}</p>{preview?.why ? <p>{reasonText(preview.why)}</p> : null}</aside></div></div>;
}

function DiscoverRow({ item, number, seed, navigationIndex, selected, onHover, onComplete }: { item: Recommendation; number: number; seed: number; navigationIndex: number; selected: boolean; onHover: () => void; onComplete: () => void }) {
  return <div className={`row drow${selected ? " sel" : ""}`} data-list-nav={navigationIndex} aria-current={selected ? "true" : undefined} onMouseOver={onHover}><span className="num">{String(number).padStart(2, "0")}</span><Cover className="thumb" src={item.coverUrl} seed={seed} title={item.title} /><span className="t">{item.title} <span className="muted">/ {item.publisher}</span>{item.why ? <small>{reasonText(item.why)}</small> : null}</span><RecommendationActions id={item.id} title={item.title} dismissible onComplete={onComplete} /></div>;
}

