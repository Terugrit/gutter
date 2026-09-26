import Link from "next/link";
import { Cover } from "@/components/cover";
import { DashboardActions } from "@/components/dashboard-actions";
import { Headline } from "@/components/headline";
import { getMissingIssues } from "@/lib/services/missing";
import { getNotifications } from "@/lib/services/notifications";
import { getLiveReadingStats } from "@/lib/services/reading";
import { getRecommendations } from "@/lib/services/recommendations";
import { getServices } from "@/lib/services/settings";
import { getUpcomingIssues } from "@/lib/services/upcoming";
import { reasonText } from "@/lib/recommendation-ranking";

export default async function Page() {
  if (!(await getServices()).some((service) => service.configured)) return <div className="page"><Headline lines={["Connect", "your services", "pick some comics"]} /><section className="sec"><header><h2>Get started</h2></header>{[["Settings", "/settings"], ["Library", "/library"], ["Notifications", "/notifications"]].map(([label, href], index) => <Link className="row" key={href} href={href}><span className="num">{String(index + 1).padStart(2, "0")}</span><span className="t">{label}</span><span>→</span></Link>)}</section></div>;
  const [missing, notifications, stats, recommendations, upcoming] = await Promise.all([getMissingIssues(), getNotifications(), getLiveReadingStats(), getRecommendations(), getUpcomingIssues()]);
  const newestDate = notifications[0]?.d;
  const newIssues = newestDate ? notifications.filter((item) => item.d === newestDate).length : 0;
  const strip = (items: typeof recommendations.recommended, offset: number) => items.length ? <div className="strip">{items.map((item, index) => <figure key={item.id}><Cover src={item.coverUrl} seed={index + offset} title={item.title} /><figcaption>{item.title}{item.why ? <span>{reasonText(item.why)}</span> : null}<DashboardActions title={item.title} recommendationId={item.id} /></figcaption></figure>)}</div> : <p className="muted">No recommendations yet. Refresh Discover after connecting Komga and Metron.</p>;
  const weeks = [...new Set(upcoming.map((issue) => issue.week))];
  const weekLabel = (date: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
  return <div className="page">
    <Headline lines={[`${newIssues} new issues`, `${missing.length} missing`, `${stats?.booksRead ?? 0} books read`]} />
    <section className="sec"><header><h2>Missing issues</h2><Link href="/library">Manage followed series</Link></header>{missing.length ? <DashboardActions missing={missing} /> : <p className="muted">No missing issues.</p>}</section>
    <section className="sec"><header><h2>Coming up</h2></header>{weeks.length ? weeks.map((week) => <div className="upcoming-week" key={week}><p className="week-label">Week of {weekLabel(week)}</p><div className="strip">{upcoming.filter((issue) => issue.week === week).map((issue) => <figure key={issue.id}><Link href={`/series/${encodeURIComponent(issue.seriesId)}`} aria-label={`${issue.series} issue ${issue.number}, ${issue.date}`}><Cover src={issue.coverUrl ?? undefined} seed={[...`${issue.seriesId}:${issue.number}`].reduce((sum, char) => sum + char.charCodeAt(0), 0)} title={issue.series} number={issue.number} /></Link><figcaption>{issue.series} #{issue.number}{issue.moved ? <small className="moved-tag" title={issue.previousDate ? `Moved from ${issue.previousDate}` : undefined}>moved</small> : null}<span>{issue.date}{issue.title ? ` / ${issue.title}` : ""}</span></figcaption></figure>)}</div></div>) : <p className="muted">No issues due in the next 30 days.</p>}</section>
    <section className="sec"><header><h2>Recommended for you</h2><Link href="/discover">See all</Link></header>{strip(recommendations.recommended, 2)}</section>
    <section className="sec"><header><h2>Something different</h2><Link href="/discover">See all</Link></header>{strip(recommendations.different, 5)}</section>
    <section className="sec"><header><h2>Reading</h2><Link href="/recap">View reading recap</Link></header>{stats ? <div className="stats">{[[stats.booksRead, "Books read"], [stats.inProgress, "In progress"], [stats.seriesCompleted, "Series completed"], [stats.readThisMonth, "Read this month"]].map(([number, label]) => <div className="stat" key={label as string}><b>{number}</b><span>{label}</span></div>)}</div> : <p className="muted">Connect and sync Komga to see reading statistics.</p>}</section>
  </div>;
}
