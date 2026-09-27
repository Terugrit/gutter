import Database from "better-sqlite3";
import sample from "../../docs/design/sample-data.json";
import { env } from "../env";
if (!process.env.GUTTER_VISUAL_TEST) throw new Error("Visual seed only runs in the isolated visual test environment");
const sqlite = new Database(env.GUTTER_DB_PATH);
const now = new Date().toISOString();
const utcDate = (value: string) => { const [day, month, year] = value.split(" "); const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; return `${year}-${String(months.indexOf(month) + 1).padStart(2, "0")}-${day.padStart(2, "0")}`; };
sqlite.exec("DELETE FROM release_shelf; DELETE FROM watches; DELETE FROM upcoming_releases; DELETE FROM dismissed_series; DELETE FROM interest_filters; DELETE FROM interest_weights; DELETE FROM notifications; DELETE FROM issues; DELETE FROM followed_series; DELETE FROM reading_shelf; DELETE FROM kv_cache; DELETE FROM sqlite_sequence;");
const series = sample.library.map((item) => ({ id: `visual:${item.id}`, t: item.t, pub: item.pub, seed: item.seed, thumbnail: "" }));
const putCache = sqlite.prepare("INSERT INTO kv_cache (key,value_json,fetched_at,ttl_seconds) VALUES (?,?,?,?)");
putCache.run("komga:series", JSON.stringify(series), now, 86400);
const syntheticBooks = [
  ...Array.from({ length: 128 }, (_, index) => ({ seriesId: `read:${index < 14 ? index : 0}`, readProgress: { completed: true, readDate: index < 9 ? now : "2026-08-01T00:00:00Z" } })),
  ...Array.from({ length: 6 }, (_, index) => ({ seriesId: `progress:${index}`, readProgress: { completed: false } })),
];
putCache.run("komga:books", JSON.stringify(syntheticBooks), now, 86400);
const insertFollow = sqlite.prepare("INSERT INTO followed_series (komga_series_id,title,publisher,metron_series_id,match_status,monitor_mode,active,created_at) VALUES (?,?,?,?,'confirmed','all',1,'2026-01-01T00:00:00Z')");
const followIds = new Map<string, number>();
for (const item of sample.library.filter((item) => item.fol)) followIds.set(item.t, Number(insertFollow.run(`visual:${item.id}`, item.t, item.pub, item.id + 1).lastInsertRowid));
const ensureFollow = (title: string, publisher: string) => { let id = followIds.get(title); if (!id) { id = Number(insertFollow.run(`visual:extra:${title}`, title, publisher, 1000 + followIds.size).lastInsertRowid); followIds.set(title, id); } return id; };
const issue = sqlite.prepare("INSERT INTO issues (id,metron_issue_id,followed_series_id,number,title,store_date,description,credits_json,owned,active,updated_at) VALUES (?,?,?,?,?,?,?,?,?,1,?)");
const notification = sqlite.prepare("INSERT INTO notifications (id,issue_id,type,dedupe_key,sent_at,ntfy_status,read_at) VALUES (?,?,'new_release',?,?,'sent',?)");
for (const item of sample.notifications) {
  const follow = ensureFollow(item.s, item.pub);
  issue.run(item.id, item.id, follow, String(item.i), item.t, utcDate(item.d), item.desc, JSON.stringify([{ role: "Writer", person: { name: item.w } }, { role: "Artist", person: { name: item.a } }]), item.own ? 1 : 0, now);
  notification.run(item.id, item.id, `new-release:${item.id}`, now, item.u ? null : now);
}
for (const [index, item] of sample.missing.entries()) {
  const id = 100 + index; const follow = ensureFollow(item.s, "Unknown publisher");
  issue.run(id, id, follow, String(item.i), null, utcDate(item.d), null, null, 0, now);
}
const recommendations = { recommended: sample.recommendedForYou.map((item, index) => ({ id: 2000 + index, title: item.title, publisher: item.publisher, yearBegan: 2024 - index, reason: item.reason, coverUrl: "" })), different: sample.somethingDifferent.map((item, index) => ({ id: 3000 + index, title: item.title, publisher: item.publisher, yearBegan: 2019 + index, reason: item.reason, coverUrl: "" })) };
putCache.run("discover:recommendations", JSON.stringify(recommendations), now, 86400);
const upcoming = sqlite.prepare("INSERT INTO upcoming_releases (metron_issue_id,metron_series_id,series_name,issue_number,publisher,genres_json,cover_url,expected_release_date,release_confidence,is_wildcard,source,last_refreshed_at) VALUES (?,?,?,?,?,?,?,?,?,0,'metron',?)");
for (const [index, title, publisher, genre] of [[0, "Glass Meridian", "Harbor Press", "Mystery"], [1, "Paper Moon", "Harbor Press", "Science fiction"], [2, "Last Orchard", "Lamplight Comics", "Fantasy"], [3, "Far Shore", "Northfield", "Adventure"], [4, "Signal House", "Harbor Press", "Mystery"], [5, "Quiet Engine", "Independent", "Drama"]] as const) {
  upcoming.run(5000 + index, 6000 + index, title, String(index + 1), publisher, JSON.stringify([genre]), null, `2026-11-${String(2 + index).padStart(2, "0")}`, "solicited", now);
}
sqlite.close();


