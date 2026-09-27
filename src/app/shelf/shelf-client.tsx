"use client";
import { useState } from "react";
import Link from "next/link";
import { Cover } from "@/components/cover";
import { useToast } from "@/components/toast";
import type { getReadingShelf } from "@/lib/services/reading-shelf";
import type { getReleaseShelf } from "@/lib/services/coming-soon";

type ShelfItem = Awaited<ReturnType<typeof getReadingShelf>>[number];
type ReleaseItem = Awaited<ReturnType<typeof getReleaseShelf>>[number];
type Filter = "all" | "saved" | "sent";
const addedDate = (value: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(value));

export function ShelfClient({ initial, initialReleases }: { initial: ShelfItem[]; initialReleases: ReleaseItem[] }) {
  const [items, setItems] = useState(initial);
  const [releases, setReleases] = useState(initialReleases);
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<number, string>>({});
  const toast = useToast();
  const shown = items.filter((item) => filter === "all" || (filter === "sent" ? item.sent : !item.sent));
  const weeks = [...new Set(releases.map((item) => item.week))];
  const currentWeek = (() => { const date = new Date(); const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7)); return monday.toISOString().slice(0, 10); })();
  const weekLabel = (week: string) => week === currentWeek ? "This week" : `Week of ${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${week}T12:00:00Z`))}`;

  const remove = async (id: number) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/shelf/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove series from shelf");
      setItems((current) => current.filter((item) => item.id !== id));
      toast("Removed from shelf");
    } catch (error) { toast(error instanceof Error ? error.message : "Could not remove series from shelf"); }
    finally { setBusyId(null); }
  };
  const send = async (id: number) => {
    setBusyId(id);
    setErrors((current) => ({ ...current, [id]: "" }));
    try {
      const response = await fetch(`/api/shelf/${id}/kapowarr`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Could not send volume to Kapowarr");
      }
      setItems((current) => current.map((item) => item.id === id ? { ...item, sent: true, followed: true } : item));
      toast("Sent to Kapowarr");
    } catch (error) { setErrors((current) => ({ ...current, [id]: error instanceof Error ? error.message : "Could not send volume to Kapowarr" })); }
    finally { setBusyId(null); }
  };
  const removeRelease = async (id: number) => {
    setBusyId(id);
    try {
      const response = await fetch(`/api/reading-shelf/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not clear this release.");
      setReleases((current) => current.filter((item) => item.id !== id));
      toast("Removed from shelf");
    } catch (error) { toast(error instanceof Error ? error.message : "Could not clear this release."); }
    finally { setBusyId(null); }
  };

  return <div className="page"><h1 className="title">Reading shelf</h1>
    <p className="muted">Watched releases arrive here when they are due and leave after Kapowarr finishes. Saved series stay below until you remove them.</p>
    <section className="sec"><header><h2>Released for you</h2></header>{weeks.length ? weeks.map((week) => <div className="shelf-week" key={week}><p className="week-label">{weekLabel(week)}</p>{releases.filter((item) => item.week === week).map((item, index) => <div className="row drow release-row" key={item.id}><span className="num">{String(index + 1).padStart(2, "0")}</span><div className="thumb"><Cover src={item.coverUrl ?? undefined} seed={item.id} title={item.seriesName} number={item.issueNumber} /></div><span className="t">{item.seriesName} #{item.issueNumber}{item.stale ? <small className="moved-tag">stale</small> : null}<small>Added {addedDate(item.addedAt)} / {item.status}</small></span><span className="release-actions">{item.kapowarrLink ? <a className="lnk" href={item.kapowarrLink} target="_blank" rel="noreferrer">Open Kapowarr</a> : <span className="muted">Waiting for Kapowarr</span>}<button className="lnk" disabled={busyId !== null} onClick={() => void removeRelease(item.id)}>Clear</button></span></div>)}</div>) : <p className="muted">Nothing waiting here. Follow a Coming Soon release from the dashboard.</p>}</section>
    <section className="sec"><header><h2>Saved series</h2></header>{items.length ? <><p className="muted">Sending a volume to Kapowarr also follows the series.</p><div className="tools" aria-label="Shelf filters">{(["all", "saved", "sent"] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === "all" ? "All" : value === "saved" ? "Saved" : "Sent to Kapowarr"}</button>)}</div>
      <div className="grid">{shown.map((item) => <div key={item.id}><div className="item"><Cover src={item.coverUrl ?? undefined} seed={item.id} title={item.title} /><div className="cap">{item.title}<small>{item.yearBegan ? `Year began: ${item.yearBegan}` : "Year unknown"}</small><small>{item.publisher}</small></div></div><div className="shelf-actions"><button className="lnk" disabled={item.sent || busyId !== null} onClick={() => void send(item.id)} title={item.sent ? undefined : "Sending also follows this series"}>{item.sent ? "Sent to Kapowarr" : busyId === item.id ? "Sending…" : errors[item.id] ? "Failed, retry" : "Send to Kapowarr"}</button><button className="lnk" disabled={busyId !== null} onClick={() => void remove(item.id)}>Remove from shelf</button></div>{errors[item.id] ? <p role="status" className="muted">{errors[item.id]}</p> : null}</div>)}</div>
      {!shown.length ? <p className="muted">No series in this view. <button className="lnk" onClick={() => setFilter("all")}>Show all</button></p> : null}</> : <><h2 className="title">Your saved shelf is empty.</h2><Link className="lnk" href="/discover">Browse Discover</Link></>}</section>
  </div>;
}
