"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Cover } from "@/components/cover";
import { Dock } from "@/components/dock";
import { Headline } from "@/components/headline";
import { MetaTable } from "@/components/meta-table";
import { Kapowarr } from "@/components/dashboard-actions";
import { useToast } from "@/components/toast";
import type { SeriesDetail } from "@/lib/services/series";
import { useListNavigation } from "@/components/use-list-navigation";
import { matchSearchTitle } from "@/lib/matching/metron";

import { SeriesProgress } from "@/components/series-progress";

type Candidate = { id: number; series: string; year_began?: number | null; publisher?: { name: string } | null };
export function SeriesView({ series }: { series: SeriesDetail }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [skippedOnly, setSkippedOnly] = useState(false);
  const [skipBusy, setSkipBusy] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const visibleIssues = series.issues.filter((item) => skippedOnly ? item.skippedAt !== null : item.skippedAt === null);
  const skippedCount = series.issues.filter((item) => item.skippedAt !== null).length;
  const movedRecently = (item: SeriesDetail["issues"][number]) => item.dateChangedAt !== null && Date.now() - item.dateChangedAt <= 14 * 24 * 60 * 60 * 1000;
  const [mode, setMode] = useState(series.monitorMode);
  const [modeBusy, setModeBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(() => matchSearchTitle(series.title));
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const closeDialog = useCallback(() => { setOpen(false); window.requestAnimationFrame(() => changeRef.current?.focus()); }, []);
  const router = useRouter();
  const toast = useToast();
  const issue = series.issues.find((item) => item.id === selected);
  const openIssue = useCallback((index: number) => setSelected(index === 0 ? -1 : visibleIssues[index - 1]?.id ?? null), [visibleIssues]);
  const selectedIssueIndex = visibleIssues.findIndex((item) => item.id === selected);
  const escapeIssues = useCallback(() => setSelected(null), []);
  const { containerRef, selectedIndex } = useListNavigation({ count: visibleIssues.length + 1, activeIndex: selected === null ? -1 : selected === -1 ? 0 : selectedIssueIndex < 0 ? -1 : selectedIssueIndex + 1, onOpen: openIssue, onEscape: escapeIssues, enabled: !open });
  useEffect(() => { if (open) searchRef.current?.focus(); }, [open, closeDialog]);
  useEffect(() => {
    if (!open) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDialog();
      if (event.key === "Tab") {
        const elements = document.querySelectorAll<HTMLElement>(".match-sheet button:not([disabled]), .match-sheet input");
        const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, closeDialog]);
  async function toggleSkipped() {
    if (!issue || skipBusy || refreshing) return;
    setSkipBusy(true);
    try {
      const response = await fetch('/api/issues/' + issue.id + '/skip', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ skipped: issue.skippedAt === null }) });
      if (!response.ok) throw new Error('Could not update this issue');
      startTransition(() => router.refresh());
      toast(issue.skippedAt === null ? 'Issue skipped' : 'Issue restored');
    } catch { toast('Could not update this issue'); }
    finally { setSkipBusy(false); }
  }
  async function search() {
    setBusy(true); setMessage(null);
    try { const response = await fetch(`/api/series/${encodeURIComponent(series.id)}/match`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) }); const data = await response.json() as { candidates?: Candidate[]; error?: string }; if (!response.ok) throw new Error(data.error ?? "Search failed"); setCandidates(data.candidates ?? []); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Search failed"); }
    finally { setBusy(false); }
  }
  async function select(metronSeriesId: number) {
    setBusy(true); setMessage(null);
    try { const response = await fetch(`/api/series/${encodeURIComponent(series.id)}/match`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metronSeriesId }) }); const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "Could not save this match"); closeDialog(); router.refresh(); toast("Match updated"); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Could not save this match"); }
    finally { setBusy(false); }
  }
  async function changeMode(next: "future_only" | "all") {
    if (next === mode || modeBusy) return;
    setModeBusy(true);
    try { const response = await fetch(`/api/series/${encodeURIComponent(series.id)}/monitor`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: next }) }); if (!response.ok) throw new Error("Monitoring could not be updated"); setMode(next); router.refresh(); }
    catch { toast("Monitoring could not be updated"); }
    finally { setModeBusy(false); }
  }
  return <div className={`split${selected !== null ? " has-sel" : ""}`}><aside ref={containerRef} className="index" aria-label="Series issues"><div className="mbar"><Link href="/library">← Library</Link></div><div className="filters"><button aria-pressed={!skippedOnly} onClick={() => { setSkippedOnly(false); setSelected(null); }}>Issues</button><button aria-pressed={skippedOnly} onClick={() => { setSkippedOnly(true); setSelected(null); }}>Skipped ({skippedCount})</button></div><div className="idx-head"><span>No.</span><span>Issue</span><span>State</span></div><button className={`row${selectedIndex === 0 ? " sel" : ""}`} data-list-nav={0} aria-current={selectedIndex === 0 ? "true" : undefined} onClick={() => setSelected(-1)}><span className="num">—</span><span className="t">Manage series</span><span>→</span></button>{visibleIssues.map((item, index) => <button className={`row${selectedIndex === index + 1 ? " sel" : ""}`} data-list-nav={index + 1} aria-current={selectedIndex === index + 1 ? "true" : undefined} key={item.id} onClick={() => setSelected(item.id)}><span className="num">{String(index + 1).padStart(2, "0")}</span><span className="t">#{item.number} {item.title ?? ""}{movedRecently(item) ? <small className="moved-tag" title={item.previousDate ? `Moved from ${item.previousDate}` : undefined}>moved{item.previousDate ? <span className="moved-from"> · from {item.previousDate}</span> : null}</small> : null}</span><span>{item.skippedAt !== null ? "Skipped" : item.owned ? "● Owned" : item.storeDate && item.storeDate > series.today ? "◐ Upcoming" : "○ Missing"}</span></button>)}{visibleIssues.length === 0 ? <p className="muted">{skippedOnly ? "No skipped issues." : "No issues to show."} <Link href="/settings">Refresh releases in Settings.</Link></p> : null}</aside><section className="stage"><div className="mbar"><button className="lnk" onClick={() => setSelected(null)}>← Issues</button></div><Headline lines={[series.title, issue ? `Issue ${issue.number}` : "Issues", issue?.storeDate ? `Out ${issue.storeDate}` : "From your library"]} /><SeriesProgress progress={series.progress} /><p className="muted" role="status">{series.kapowarrSent ? series.kapowarrStatus ? `Sent to Kapowarr · ${series.kapowarrStatus.queued} downloading · ${series.kapowarrStatus.filesHave} of ${series.kapowarrStatus.filesTotal} files` : "Sent to Kapowarr · status pending" : "Not sent to Kapowarr"}</p><div className="detail"><Cover src={issue?.coverUrl ?? series.thumbnail} seed={series.seed} title={series.title} number={issue?.number} /><div><MetaTable rows={[["Publisher", series.publisher ?? "Unknown publisher"], ["Match", series.matchStatus === "unmatched" ? "Unmatched — choose a match" : series.matchStatus === "auto" ? "Best guess" : "Confirmed"], ["Monitoring", mode === "future_only" ? "Future only" : "All issues"], ...(issue ? [["Issue title", issue.title ?? "Untitled issue"] as [string, string], ["In your library", issue.owned ? "● Owned" : "○ Missing"] as [string, string]] : [])]} /><div className="tools"><button aria-pressed={mode === "future_only"} disabled={modeBusy} onClick={() => void changeMode("future_only")}>Future only</button><button aria-pressed={mode === "all"} disabled={modeBusy} onClick={() => void changeMode("all")}>All issues</button></div>{issue ? <div className="tools"><button disabled={skipBusy || refreshing} onClick={() => void toggleSkipped()}>{skipBusy || refreshing ? "Saving…" : issue.skippedAt !== null ? "Unskip issue" : "Skip issue"}</button></div> : null}</div></div><Dock><Kapowarr className="btn primary" seriesId={series.id} initialDone={series.kapowarrSent} disabled={series.matchStatus === "unmatched" || !series.metronSeriesId} /><button ref={changeRef} className="btn" onClick={() => { setOpen(true); void search(); }}>Change match</button></Dock></section>{open ? <div className="match-layer" role="dialog" aria-modal="true" aria-label="Change match"><button className="match-scrim" aria-label="Close match search" onClick={closeDialog} /><aside className="match-sheet"><button className="lnk" onClick={closeDialog}>Close</button><h2>Change match</h2><div className="tools"><input ref={searchRef} aria-label="Search Metron series" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /><button disabled={busy} onClick={() => void search()}>{busy ? "Searching…" : "Search"}</button></div>{message ? <p role="alert" className="muted">{message}</p> : null}<div className="idx-head"><span>No.</span><span>Candidate</span><span /></div>{candidates.map((candidate, index) => <div className="row" key={candidate.id}><span className="num">{String(index + 1).padStart(2, "0")}</span><span className="t">{candidate.series} {candidate.year_began ? `(${candidate.year_began})` : ""} {candidate.publisher?.name ? `/ ${candidate.publisher.name}` : ""}</span><button className="lnk" disabled={busy} onClick={() => void select(candidate.id)}>Use this match</button></div>)}{!busy && !message && candidates.length === 0 ? <p className="muted">No candidates found.</p> : null}</aside></div> : null}</div>;
}





