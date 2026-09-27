"use client";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "./toast";
import { RecommendationActions } from "./recommendation-actions";
import { useListNavigation } from "./use-list-navigation";
type Missing = { s: string; i: string | number; d: string; id: string; seriesId?: string; comicVineVolumeId?: number | null };
export function DashboardActions({ missing, title, recommendationId, saved = false }: { missing?: Missing[]; title?: string; recommendationId?: number; saved?: boolean }) {
  const router = useRouter();
  const open = useCallback((index: number) => { const id = missing?.[index]?.seriesId; if (id) router.push(`/series/${encodeURIComponent(id)}`); }, [missing, router]);
  const { containerRef, selectedIndex } = useListNavigation({ count: missing?.length ?? 0, onOpen: open, enabled: Boolean(missing) });
  if (title && recommendationId) return <RecommendationActions id={recommendationId} title={title} saved={saved} onComplete={() => router.refresh()} />;
  return <div ref={containerRef}>{missing?.map((item, index) => <div className={`row${selectedIndex === index ? " sel" : ""}`} data-list-nav={index} aria-current={selectedIndex === index ? "true" : undefined} key={item.id}><span className="num">{String(index + 1).padStart(2, "0")}</span><span className="t">{item.s} #{item.i} <span className="muted">/ {item.d}</span></span><Kapowarr seriesId={item.seriesId} disabled={item.comicVineVolumeId === null} /></div>)}</div>;
}
export function Kapowarr({ className = "lnk", seriesId, disabled = false, initialDone = false }: { className?: string; seriesId?: string; disabled?: boolean; initialDone?: boolean }) { const toast = useToast(); const router = useRouter(); const [state, setState] = useState<"idle" | "busy" | "done" | "failed">(initialDone ? "done" : "idle"); const send = async () => { if (!seriesId) { setState("failed"); return; } setState("busy"); try { const response = await fetch(`/api/series/${encodeURIComponent(seriesId)}/kapowarr`, { method: "POST" }); if (!response.ok) throw new Error(); setState("done"); toast("Sent to Kapowarr"); router.refresh(); } catch { setState("failed"); } }; return <button className={className} disabled={disabled || state === "busy" || state === "done"} title={disabled ? "Choose a match before sending to Kapowarr" : undefined} onClick={() => void send()}>{state === "idle" ? "Send to Kapowarr" : state === "busy" ? "Sending…" : state === "done" ? "Sent to Kapowarr" : "Failed, retry"}</button>; }
