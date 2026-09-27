"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Cover } from "./cover";
import { useToast } from "./toast";
import type { SeriesOverlayDetail } from "@/lib/services/series-overlay";

const OverlayContext = createContext<(reference: string) => void>(() => undefined);
const detailCache = new Map<string, SeriesOverlayDetail>();
const interactiveSelector = "button,a,input,select,textarea,summary";

export function useSeriesDetailOverlay() { return useContext(OverlayContext); }

export function SeriesDetailOverlayProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [reference, setOpenReference] = useState<string | null>(null);
  useEffect(() => {
    const readLocation = () => setOpenReference(new URLSearchParams(window.location.search).get("series"));
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, [pathname]);
  const setReference = useCallback((nextReference: string | null) => {
    const next = new URLSearchParams(window.location.search);
    if (nextReference) next.set("series", nextReference); else next.delete("series");
    setOpenReference(nextReference);
    window.history.replaceState(window.history.state, "", `${pathname}${next.size ? `?${next.toString()}` : ""}`);
  }, [pathname]);

  useEffect(() => {
    const openFromElement = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      const trigger = target.closest<HTMLElement>("[data-series-detail]");
      if (!trigger || (target.closest(interactiveSelector) && target.closest(interactiveSelector) !== trigger)) return null;
      return trigger.dataset.seriesDetail ?? null;
    };
    const click = (event: MouseEvent) => { const next = openFromElement(event.target); if (next) setReference(next); };
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const next = openFromElement(event.target);
      if (!next) return;
      event.preventDefault();
      setReference(next);
    };
    document.addEventListener("click", click);
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("click", click); document.removeEventListener("keydown", keydown); };
  }, [setReference]);

  return <OverlayContext.Provider value={(value) => setReference(value)}>{children}{reference ? <SeriesDetailOverlay reference={reference} onClose={() => setReference(null)} /> : null}</OverlayContext.Provider>;
}

function SeriesDetailOverlay({ reference, onClose }: { reference: string; onClose: () => void }) {
  const [detail, setDetail] = useState<SeriesOverlayDetail | null>(() => detailCache.get(reference) ?? null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState<"follow" | "kapowarr" | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  const pointerStart = useRef<number | null>(null);
  const router = useRouter();
  const toast = useToast();
  const loading = !detail && !error;

  useEffect(() => {
    restoreFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const main = document.querySelector<HTMLElement>("main");
    const previousOverflow = main?.style.overflow;
    if (main) main.style.overflow = "hidden";
    closeButton.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { onClose(); return; }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0]; const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("keydown", keyboard); if (main) main.style.overflow = previousOverflow ?? ""; restoreFocus.current?.focus(); };
  }, [onClose]);
  useEffect(() => {
    const cached = detailCache.get(reference);
    if (cached) { setDetail(cached); setError(""); return; }
    const controller = new AbortController();
    setDetail(null); setError("");
    void fetch(`/api/series/${encodeURIComponent(reference)}`, { signal: controller.signal }).then(async (response) => {
      const body = await response.json() as SeriesOverlayDetail & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Series details could not be loaded.");
      detailCache.set(reference, body); setDetail(body);
    }).catch((reason: unknown) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Series details could not be loaded."); });
    return () => controller.abort();
  }, [reference, retry]);

  const toggleFollow = async () => {
    if (!detail) return;
    setBusy("follow");
    try {
      const response = detail.followed && detail.komgaSeriesId
        ? await fetch("/api/follows", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [detail.komgaSeriesId] }) })
        : detail.metronSeriesId
          ? await fetch(`/api/discover/${detail.metronSeriesId}/follow`, { method: "POST" })
          : await fetch("/api/follows", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ series: [{ id: detail.komgaSeriesId, title: detail.title, publisher: detail.publisher ?? undefined }] }) });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Follow status could not be changed.");
      const followed = !detail.followed;
      const next = { ...detail, followed, komgaSeriesId: detail.komgaSeriesId ?? (detail.metronSeriesId ? `discover:${detail.metronSeriesId}` : null) };
      detailCache.set(reference, next); setDetail(next);
      toast(`${followed ? "Following" : "Unfollowed"} ${detail.title}`);
      router.refresh();
    } catch (reason) { toast(reason instanceof Error ? reason.message : "Follow status could not be changed."); }
    finally { setBusy(null); }
  };
  const sendToKapowarr = async () => {
    if (!detail) return;
    setBusy("kapowarr");
    try {
      const endpoint = detail.metronSeriesId ? `/api/discover/${detail.metronSeriesId}/kapowarr` : `/api/series/${encodeURIComponent(detail.komgaSeriesId ?? "")}/kapowarr`;
      const response = await fetch(endpoint, { method: "POST" });
      const body = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Kapowarr request failed.");
      const next = { ...detail, followed: true, kapowarrSent: true, komgaSeriesId: detail.komgaSeriesId ?? (detail.metronSeriesId ? `discover:${detail.metronSeriesId}` : null) };
      detailCache.set(reference, next); setDetail(next);
      toast("Sent to Kapowarr"); router.refresh();
    } catch (reason) { toast(reason instanceof Error ? reason.message : "Kapowarr request failed."); }
    finally { setBusy(null); }
  };
  const swipeEnd = (event: React.PointerEvent) => {
    if (pointerStart.current !== null && event.clientY - pointerStart.current > 80) onClose();
    pointerStart.current = null;
  };

  return <div className="series-overlay-layer">
    <button className="series-overlay-backdrop" aria-label="Dismiss series details" onClick={onClose} />
    <section ref={panel} className="series-overlay-panel" role="dialog" aria-modal="true" aria-labelledby="series-overlay-title" onPointerDown={(event) => { if (event.pointerType === "touch") { pointerStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); } }} onPointerUp={swipeEnd}>
      <button ref={closeButton} className="series-overlay-close" onClick={onClose} aria-label="Close series details">Close</button>
      {loading ? <OverlaySkeleton /> : error ? <div className="series-overlay-error" role="alert"><p>{error}</p><button className="lnk" onClick={() => setRetry((value) => value + 1)}>Retry</button></div> : detail ? <>
        <div className="series-overlay-layout">
          <div className="series-overlay-summary"><Cover src={detail.coverUrl ?? undefined} seed={detail.seed} title={detail.title} /><h2 id="series-overlay-title">{detail.title}</h2></div>
          <div className="series-overlay-content">
            <dl className="meta">
              <div><dt>Publisher</dt><dd>{detail.publisher ?? "Unknown"}</dd></div>
              <div><dt>Year</dt><dd>{detail.year ?? "Unknown"}</dd></div>
              {detail.status ? <div><dt>Series status</dt><dd>{detail.status === "ended" ? "Ended" : "Ongoing"}</dd></div> : null}
              <div><dt>Issues owned</dt><dd>{detail.ownedIssues} / {detail.totalIssues || "unknown"}</dd></div>
              {detail.genres.length ? <div><dt>Genres</dt><dd>{detail.genres.join(", ")}</dd></div> : null}
              {detail.nextReleaseDate ? <div><dt>Next release</dt><dd>{formatDate(detail.nextReleaseDate)}</dd></div> : null}
              <div><dt>Following</dt><dd>{detail.followed ? "Yes" : "No"}</dd></div>
              <div><dt>Reading shelf</dt><dd>{detail.onShelf ? "Saved" : "Not saved"}</dd></div>
            </dl>
            <div className="series-overlay-progress" role="progressbar" aria-label="Owned issues" aria-valuemin={0} aria-valuemax={detail.totalIssues} aria-valuenow={detail.ownedIssues}><span style={{ width: `${detail.totalIssues ? Math.min(100, detail.ownedIssues / detail.totalIssues * 100) : 0}%` }} /></div>
            <p className="desc">{detail.description ?? "No description stored yet."}</p>
            <div className="series-overlay-actions">
              <button className="btn primary" disabled={busy !== null || (!detail.metronSeriesId && !detail.komgaSeriesId)} onClick={() => void toggleFollow()}>{busy === "follow" ? "Saving…" : detail.followed ? "Unfollow" : "Follow"}</button>
              <button className="btn" disabled={busy !== null || !detail.canSendToKapowarr || detail.kapowarrSent} onClick={() => void sendToKapowarr()}>{detail.kapowarrSent ? "Sent to Kapowarr" : busy === "kapowarr" ? "Sending…" : "Send to Kapowarr"}</button>
            </div>
          </div>
        </div>
      </> : null}
    </section>
  </div>;
}

function OverlaySkeleton() {
  return <div className="series-overlay-layout series-overlay-skeleton" aria-label="Loading series details"><div className="series-overlay-summary"><div className="cv" /><span className="skeleton-bar" /></div><div className="series-overlay-content"><span className="skeleton-bar" /><span className="skeleton-bar" /><span className="skeleton-bar" /><span className="skeleton-bar" /><span className="skeleton-bar" /></div></div>;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}
