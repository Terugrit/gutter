"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Cover } from "@/components/cover";
import { Dock } from "@/components/dock";
import { useToast } from "@/components/toast";

type Item = { id: string | number; t: string; seed: number; pub: string; fol: boolean; attention: boolean; thumbnail?: string };
export function LibraryClient({ initial, initialFollowed = false, attention = false }: { initial: Item[]; initialFollowed?: boolean; attention?: boolean }) {
  const [items, setItems] = useState(initial.map((item) => ({ ...item, selected: false })));
  const [query, setQuery] = useState("");
  const [onlyFollowed, setOnlyFollowed] = useState(initialFollowed || attention);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const router = useRouter();
  const shown = useMemo(() => items.filter((item) => (!query || item.t.toLowerCase().includes(query.toLowerCase())) && (!onlyFollowed || item.fol) && (!attention || item.attention)), [items, query, onlyFollowed, attention]);
  const selected = items.filter((item) => item.selected);
  const unfollowing = selected.length > 0 && selected.every((item) => item.fol);
  const updateFollows = async () => {
    setBusy(true);
    const method = unfollowing ? "DELETE" : "POST";
    const body = unfollowing ? { ids: selected.map((item) => String(item.id)) } : { series: selected.filter((item) => !item.fol).map((item) => ({ id: String(item.id), title: item.t, publisher: item.pub })) };
    if (!unfollowing && !(body as { series: unknown[] }).series.length) { setBusy(false); return; }
    try {
      const response = await fetch("/api/follows", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      setItems((current) => current.filter((item) => !(unfollowing && item.selected && String(item.id).startsWith("discover:"))).map((item) => item.selected ? { ...item, fol: !unfollowing, attention: !unfollowing && item.attention, selected: false } : item));
      router.refresh();
      toast(unfollowing ? `Unfollowed ${selected.length} series` : `Following ${selected.filter((item) => !item.fol).length} series`);
    } catch { toast("Could not update followed series. Check your connections in Settings and retry."); }
    finally { setBusy(false); }
  };
  return <div className="page"><h1 className="title">Library</h1><div className="tools"><input type="search" placeholder="Search your library" aria-label="Search your library" value={query} onChange={(event) => setQuery(event.target.value)} /><button aria-pressed={onlyFollowed} onClick={() => setOnlyFollowed(!onlyFollowed)}>Followed only</button>{attention ? <Link className="lnk" href="/library?followed=1">Show all followed</Link> : null}</div><div className="grid">{shown.map((item) => <div key={item.id}><button className={`item${item.selected ? " sel" : ""}`} aria-pressed={item.selected} onClick={() => setItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, selected: !candidate.selected } : candidate))}><Cover src={item.thumbnail} seed={item.seed} title={item.t} /><span className="chk" aria-hidden="true">✓</span><div className="cap">{item.t}<small>{item.attention ? "○ Needs match" : item.fol ? "● Following" : item.pub}</small></div></button>{item.fol ? <Link className="lnk" href={`/series/${encodeURIComponent(String(item.id))}`}>Manage issues →</Link> : null}</div>)}</div>{shown.length === 0 ? items.length ? <p className="muted">{attention ? "No series need attention." : "No series match that search."}</p> : <div><h2 className="title">Nothing to follow yet.</h2><Link href="/settings">Choose your Komga library</Link></div> : null}{selected.length ? <Dock fixed><button className="btn primary" disabled={busy} onClick={() => void updateFollows()}>{busy ? "Saving…" : unfollowing ? `Unfollow ${selected.length} series` : `Follow ${selected.filter((item) => !item.fol).length} series`}</button><button className="btn" disabled={busy} onClick={() => setItems((current) => current.map((item) => ({ ...item, selected: false })))}>Clear</button></Dock> : null}</div>;
}



