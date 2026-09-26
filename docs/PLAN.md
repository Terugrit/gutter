# Comic Release Tracker: Plan

## Files in this pack

```
AGENTS.md                                   repo root
docs/PLAN.md                                this file
docs/DESIGN.md                              visual spec (exact)
docs/design/preview.html                    the approved interactive mockup (source of truth for UI)
docs/design/globals.css                     the design system CSS -> copy to src/app/globals.css
docs/design/sample-data.json                sample data used by the mockup -> seed script
docs/design/notifications-reference.png     the original inspiration image
docs/design/screenshots/*.png               desktop + mobile renders of the preview (real font)
```

Start every task with:
> Read AGENTS.md, docs/PLAN.md and docs/DESIGN.md. Implement milestone M<n> only. When done, summarise files changed, decisions made, deviations from the preview (if any), and open TODO(verify) items.

---

## 1. What it is

A single Next.js app that:
- lets you pick series from your Komga library to follow
- matches them to Metron and watches for new (English) issues
- sends ntfy notifications, plus a weekly digest
- links every series and issue to Kapowarr for download
- shows a dashboard (missing issues, recommendations, reading stats) and a Discover page

## 2. Integrations

| Service | Role |
|---|---|
| Komga | Library source, owned issues, read progress |
| Metron | Primary metadata and release dates (English filtering, covers, credits) |
| ComicVine | Fallback only. Kapowarr needs a ComicVine ID, so use it when Metron has no `cv_id` |
| Kapowarr | Add volume by ComicVine ID, trigger search |
| ntfy | Push notifications |

## 3. Data model (keep it small)

```
followed_series
  id, komga_series_id (unique), title, publisher,
  metron_series_id, comicvine_volume_id, kapowarr_volume_id,
  match_status (auto | confirmed | unmatched),
  monitor_mode (future_only | all)   -- default future_only
  created_at

issues                    -- cached from Metron
  id, metron_issue_id (unique), followed_series_id,
  number, title, store_date, cover_url, description,
  credits_json (writer, artist, ...), owned (bool, updated by the Komga sync), updated_at

notifications
  id, issue_id, type (new_release | weekly_digest),
  dedupe_key (unique), sent_at, ntfy_status, read_at

kv_cache                  -- API cache, recommendations, stats, mock extras
  key (unique), value_json, fetched_at, ttl_seconds
```

Reading stats are not stored; fetch from Komga with a short cache.

## 4. Jobs

| Job | Schedule | Does |
|---|---|---|
| `refresh-releases` | every 6h | Fetch new/changed issues from Metron for followed series, then create and send `new_release` notifications for released, not-yet-notified issues |
| `weekly-digest` | Wednesday 09:00 | One ntfy message: this week's releases for followed series |
| `refresh-discover` | weekly | Regenerate both recommendation sets |

## 5. Pages

The five main pages are fully specified by `preview.html` and DESIGN.md. Series detail and first run are **not** in the preview; DESIGN.md section 9 says how to build them from the same parts.

| Route | Content |
|---|---|
| `/` | Dashboard |
| `/library` | Cover grid, search, Followed only, multi-select Follow |
| `/notifications` | Split layout, list on the left, summary stage on the right |
| `/notifications/[id]` | Same layout, detail on the right. ntfy click target |
| `/discover` | Two numbered lists with hover cover preview |
| `/settings` | Connection test per service |
| `/series/[id]` | Followed series: issue index + stage, match "Change" sheet, Kapowarr button |

## 6. Milestones

### M1: Scaffold, exact UI from the preview, Docker
The design is built first, against sample data, so everything after it only swaps data sources.

**Tasks:**
1. Next.js + TypeScript + pnpm. Copy `docs/design/globals.css` to `src/app/globals.css` unchanged. Playfair Display via `next/font/google` (`--font-playfair`, weights 400/500/600).
2. Components (see DESIGN.md section 8): `TopBar`, `TabBar`, `Toast`, `IndexRow`, `Headline`, `Cover`, `GeneratedCover` (port `cover()` from preview.html), `MetaTable`, `Dock`, `KapowarrButton`.
3. SQLite/Drizzle schema (section 3). `pnpm db:seed-mock` loads `docs/design/sample-data.json` into the tables and `kv_cache` (recommendations, missing issues, reading stats, library list, services). Refuse to run when `NODE_ENV=production` unless `--force`.
4. Pages `/`, `/library`, `/notifications`, `/notifications/[id]`, `/discover`, `/settings`, reading data only through `src/lib/services/*`. Behaviours exactly as DESIGN.md section 7. Kapowarr, follow and test actions are stubbed (they simulate the states) until later milestones.
5. `src/env.ts`, `GET /api/health`.
6. Docker: multi-stage `Dockerfile` (standalone output), `docker-compose.yml` (`/data` volume, `env_file`, `TZ`, healthcheck, commented external network), `.env.example`, README section (setup, first run, updating, where data lives). Migrations run at container start.
7. `pnpm test:visual`: Playwright renders every route at 1440x900 and 390x844 with seeded data and compares against `docs/design/screenshots/` with a loose threshold (0.02). Fix differences until they pass. Use the same route-to-screenshot mapping as DESIGN.md section 10.

**Accept:** the app looks like the screenshots and behaves like preview.html at desktop and mobile widths; `pnpm test`, `typecheck`, `test:visual` pass; on a fresh clone, `cp .env.example .env && docker compose up -d && docker compose exec app pnpm db:seed-mock --force` gives a working app; `/api/health` returns 200; data survives `docker compose down && up`.

### M2: Komga client and real library
**Tasks:** `docs/api-notes/komga.md`. Komga client (library selection, series paging, books per series, auth). `sync-komga` job (hourly): series list plus owned flags. `/library` reads real series and covers (Komga thumbnails, proxied through the app so the Komga key never reaches the browser). Follow persists to `followed_series`. Settings: show the configured service URL exactly, real Komga connection test, and persist a selected Komga library.
**Accept:** series load from mocked Komga (msw); following persists; re-sync doesn't duplicate; selecting a Komga library excludes every other library (such as ebooks); UI unchanged from M1.

### M3: Metron matching and issue cache
**Tasks:** `docs/api-notes/metron.md`. Metron client (series search, issues per series, English filter) behind the rate-limited queue and cache. Matcher: IDs in Komga metadata first, then Metron search by title + publisher + year, scored. On follow, auto-match and store `cv_id` as `comicvine_volume_id`. Minimal match UI on `/series/[id]`: best guess plus a "Change" link opening a side sheet with search and candidates. Populate `issues`.
**Accept:** matcher tests on fixtures (same title different years, reboots); unmatched series clearly flagged and never notified; no Metron calls on page load.

### M4: Real notifications, ntfy, weekly digest
**Tasks:** ntfy client + real test button. `refresh-releases` and `weekly-digest` jobs. Notifications pages now read real data; opening a notification sets `read_at`.
**Accept:** simulated new issue produces exactly one ntfy request even when the job runs three times; digest sends once per week; empty weeks send nothing; pages handle missing cover/description; ntfy click URL opens the right page.

Notification format: title `New: <Series> #<n>`, body with issue title + date, cover attached, click URL = `APP_BASE_URL/notifications/<id>`.

### M5: Kapowarr and missing issues
**Tasks:** `docs/api-notes/kapowarr.md`. Kapowarr client (add volume by ComicVine ID, trigger search, status). ComicVine client, only when Metron lacks `cv_id`. Replace the stubbed Kapowarr buttons (states: idle, busy, done, plus a failed state that shows "Failed, retry" using the same button style). Missing issues = released Metron issues minus Komga-owned, plain issue numbers, respecting `monitor_mode`. Dashboard list reads real data.
**Accept:** adding an existing volume is treated as success; nothing downloads without a click; `future_only` shows no back-catalogue flood; annuals and variants are ignored, not miscounted.

### M6: Reading stats and Discover
**Tasks:** Verify in `docs/api-notes/komga.md` what Komga exposes (read progress, read status filters). Stats cards on the dashboard. Discover: library-based (10) from top publishers and writers of followed/owned series with a short reason ("Same writer as X"); random (10) English Metron series not in the library, max 2 per publisher, must have cover and issues. Cache results; Refresh; Follow and Dismiss.
**Accept:** stats only use real Komga endpoints (gaps documented, not faked); no followed or owned series in Discover; the two sets never overlap; every library-based row has a reason.

## 7. Known risks

1. **Matching** (Komga to Metron) decides everything else. Review M3 results on your real library before enabling notifications.
2. **Metron rate limits.** Everything goes through the queue and cache.
3. **Missing ComicVine IDs.** Fall back to ComicVine search and let the user confirm.
4. **Recommendations are heuristic**, so treat them as suggestions.
5. **Playfair at small sizes** is the design's weakest point; do not go below the sizes in DESIGN.md.
6. **No auth.** Assumes LAN or a reverse proxy. Add basic auth later if exposed.
