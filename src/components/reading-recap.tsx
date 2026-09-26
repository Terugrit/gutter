import Link from "next/link";
import type { ReadingRecap } from "@/lib/services/recap";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function ReadingRecapPage({ recap }: { recap: ReadingRecap | null }) {
  return <div className="page"><h1 className="title">Reading recap</h1><div className="tools"><Link className="lnk" href="/">← Dashboard</Link>{recap?.years.map((year) => <Link className="lnk" aria-current={year === recap.year ? "page" : undefined} href={`/recap/${year}`} key={year}>{year}</Link>)}</div>
    {!recap ? <section className="sec"><h2 className="title">Sync Komga to see your reading recap.</h2><Link href="/settings">Connect Komga</Link></section> : !recap.booksCompleted ? <section className="sec"><h2 className="title">No reads in {recap.year}.</h2><Link href="/library">Browse your library</Link></section> : <>
      <section className="sec" style={{ marginTop: 24 }}><header><h2>{recap.year} in books</h2></header><div className="stats"><div className="stat"><b>{recap.booksCompleted}</b><span>Books completed</span></div><div className="stat"><b>{recap.seriesFinished}</b><span>Series finished</span></div><div className="stat"><b>{recap.longestStreak}</b><span>Longest reading streak · days</span></div><div className="stat"><b>{recap.busiestMonth ? MONTHS[recap.busiestMonth - 1] : "—"}</b><span>Busiest month</span></div></div></section>
      <section className="sec"><header><h2>Months</h2></header><div className="recap-months" aria-label="Books completed each month">{recap.months.map((count, index) => <div className="recap-month" key={index}><span title={`${count} books`}><i style={{ height: `${count / Math.max(...recap.months) * 100}%` }} /></span>{MONTHS[index]}</div>)}</div></section>
      <section className="sec"><header><h2>Top series</h2></header>{recap.topSeries.map((item, index) => <div className="row" key={item.id}><span className="num">{String(index + 1).padStart(2, "0")}</span><span className="t">{item.title}</span><span className="muted">{item.count} books</span></div>)}</section>
    </>}
  </div>;
}
