"use client";
import { FormEvent, useState } from "react";
import { Cover } from "./cover";
import { useToast } from "./toast";
import type { getComingSoon, getInterestFilters } from "@/lib/services/coming-soon";

type Item = Awaited<ReturnType<typeof getComingSoon>>[number];
type InterestFilter = Awaited<ReturnType<typeof getInterestFilters>>[number];
type SearchResult = { id: number; title: string; publisher: string; yearBegan: number | null };

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

export function ComingSoon({ initial, initialFilters }: { initial: Item[]; initialFilters: InterestFilter[] }) {
  const [items, setItems] = useState(initial);
  const [filters, setFilters] = useState(initialFilters);
  const [scopes, setScopes] = useState<Record<number, "issue" | "series">>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filterKind, setFilterKind] = useState<"publisher" | "genre">("publisher");
  const [filterValue, setFilterValue] = useState("");
  const toast = useToast();

  const reload = async () => {
    const response = await fetch("/api/dashboard/coming-soon");
    if (response.ok) setItems(((await response.json()) as { items: Item[] }).items);
  };
  const follow = async (item: Item) => {
    setBusy(`watch:${item.id}`);
    try {
      if (item.watch) {
        const response = await fetch(`/api/watches/${item.watch.id}`, { method: "DELETE" });
        if (!response.ok) throw new Error("Could not unfollow this release.");
        setItems((current) => current.map((value) => value.id === item.id ? { ...value, watch: null } : value));
        toast(`Unfollowed ${item.seriesName}`);
      } else {
        const response = await fetch("/api/watches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upcoming_release_id: item.id, scope: scopes[item.id] ?? "issue" }) });
        const body = await response.json() as { watch?: Item["watch"]; error?: string };
        if (!response.ok || !body.watch) throw new Error(body.error ?? "Could not follow this release.");
        setItems((current) => current.map((value) => value.id === item.id ? { ...value, watch: body.watch! } : value));
        toast(`Following ${item.seriesName}`);
      }
    } catch (error) { toast(error instanceof Error ? error.message : "Could not update this release."); }
    finally { setBusy(null); }
  };
  const dismiss = async (item: Item) => {
    setBusy(`dismiss:${item.id}`);
    const response = await fetch("/api/upcoming-releases/dismiss", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metron_series_id: item.metronSeriesId ?? undefined, comicvine_series_id: item.comicvineSeriesId ?? undefined }) });
    if (response.ok) setItems((current) => current.filter((value) => value.metronSeriesId !== item.metronSeriesId || value.comicvineSeriesId !== item.comicvineSeriesId));
    else toast("Could not dismiss this series.");
    setBusy(null);
  };
  const lookup = async (event: FormEvent) => {
    event.preventDefault(); if (search.trim().length < 2) return;
    setBusy("search");
    try {
      const response = await fetch(`/api/upcoming-releases/search?q=${encodeURIComponent(search.trim())}`);
      const body = await response.json() as { results?: SearchResult[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Search failed.");
      setResults(body.results ?? []);
    } catch (error) { toast(error instanceof Error ? error.message : "Search failed."); }
    finally { setBusy(null); }
  };
  const addAndFollow = async (result: SearchResult) => {
    setBusy(`add:${result.id}`);
    try {
      const added = await fetch("/api/upcoming-releases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ metron_series_id: result.id }) });
      const body = await added.json() as { release?: { id: number }; error?: string };
      if (!added.ok || !body.release) throw new Error(body.error ?? "Could not add this series.");
      const watched = await fetch("/api/watches", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upcoming_release_id: body.release.id, scope: "series" }) });
      if (!watched.ok) throw new Error(((await watched.json()) as { error?: string }).error ?? "Could not follow this series.");
      toast(`Following ${result.title}`); setResults([]); setSearch(""); await reload();
    } catch (error) { toast(error instanceof Error ? error.message : "Could not add this series."); }
    finally { setBusy(null); }
  };
  const addFilter = async (event: FormEvent) => {
    event.preventDefault(); if (!filterValue.trim()) return;
    const response = await fetch("/api/interest-filters", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: filterKind, value: filterValue }) });
    const body = await response.json() as { filter?: InterestFilter; error?: string };
    if (response.ok && body.filter) { setFilters((current) => current.some((item) => item.id === body.filter!.id) ? current : [...current, body.filter!]); setFilterValue(""); await reload(); }
    else toast(body.error ?? "Could not add this filter.");
  };
  const removeFilter = async (id: number) => {
    const response = await fetch(`/api/interest-filters/${id}`, { method: "DELETE" });
    if (response.ok) { setFilters((current) => current.filter((item) => item.id !== id)); await reload(); }
  };

  return <section className="sec"><header><h2>Coming Soon</h2><span className="muted">30–45 days</span></header>
    {items.length ? <div className="strip">{items.map((item, index) => { const detailRef = item.metronSeriesId ? `metron:${item.metronSeriesId}` : item.comicvineSeriesId ? `comicvine:${item.comicvineSeriesId}` : undefined; return <figure key={item.id} data-series-detail={detailRef}><Cover src={item.coverUrl ?? undefined} seed={item.id + index} title={item.seriesName} number={item.issueNumber} detailRef={detailRef} /><figcaption>{item.seriesName} #{item.issueNumber}<span>{shortDate(item.expectedReleaseDate)} / {item.publisher}</span><span>{item.releaseConfidence}{item.isWildcard ? " / wildcard pick" : ""}{item.genres[0] ? ` / ${item.genres[0]}` : ""}</span><div className="coming-actions">{!item.watch ? <select aria-label={`Follow scope for ${item.seriesName}`} value={scopes[item.id] ?? "issue"} onChange={(event) => setScopes((current) => ({ ...current, [item.id]: event.target.value as "issue" | "series" }))}><option value="issue">This issue</option><option value="series">This series</option></select> : null}<button className="lnk" disabled={busy !== null} onClick={() => void follow(item)}>{busy === `watch:${item.id}` ? "Saving…" : item.watch ? "Unfollow" : "Follow"}</button><button className="lnk" aria-label={`Not interested in ${item.seriesName}`} disabled={busy !== null} onClick={() => void dismiss(item)}>Not interested</button></div></figcaption></figure>; })}</div> : <p className="muted">No solicited releases match yet. Refresh Coming Soon after connecting Metron.</p>}
    <details className="coming-tools"><summary className="lnk">Look something up or manage filters</summary><form className="tools" onSubmit={lookup}><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Metron series" aria-label="Search upcoming series" /><button disabled={busy === "search"}>{busy === "search" ? "Searching…" : "Look something up"}</button></form>{results.map((result, index) => <div className="row" key={result.id}><span className="num">{String(index + 1).padStart(2, "0")}</span><span className="t">{result.title}<small>{result.publisher}{result.yearBegan ? ` / ${result.yearBegan}` : ""}</small></span><button className="lnk" disabled={busy !== null} onClick={() => void addAndFollow(result)}>{busy === `add:${result.id}` ? "Adding…" : "Add and follow"}</button></div>)}<form className="tools" onSubmit={addFilter}><select aria-label="Filter kind" value={filterKind} onChange={(event) => setFilterKind(event.target.value as "publisher" | "genre")}><option value="publisher">Publisher</option><option value="genre">Genre</option></select><input value={filterValue} onChange={(event) => setFilterValue(event.target.value)} placeholder="Exclude a publisher or genre" aria-label="Excluded value" /><button>Add filter</button></form>{filters.map((filter) => <div className="row" key={filter.id}><span className="num">×</span><span className="t">{filter.value}<small>Excluded {filter.kind}</small></span><button className="lnk" onClick={() => void removeFilter(filter.id)}>Remove</button></div>)}</details>
  </section>;
}
