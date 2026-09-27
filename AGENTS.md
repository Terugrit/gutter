# AGENTS.md

Self-hosted comic release tracker. Follow series from a Komga library, get ntfy notifications for new releases (Metron data), send missing issues to Kapowarr. Single user, one Docker container.

Read these before working:
- `docs/PLAN.md`: milestones. Work on **one milestone at a time**, only the one you were asked for.
- `docs/DESIGN.md`: the visual spec. The UI must match `docs/design/preview.html` exactly.

## Stack (do not change without asking)
- TypeScript, Node 22, pnpm
- Next.js (App Router), React, **plain CSS only**: `src/app/globals.css` (copied from `docs/design/globals.css`). No Tailwind, no shadcn/ui, no CSS-in-JS, no UI kit.
- SQLite via Drizzle (`/data/app.db`)
- Scheduled jobs: `node-cron`, started from `instrumentation.ts` (no separate worker)
- zod for all env vars and external API responses
- vitest + msw for tests; Playwright for the visual check in M1
- Font: Playfair Display via `next/font/google`, variable `--font-playfair`

## Layout
```
src/app/                       routes (see DESIGN.md section 8)
src/app/globals.css            copied from docs/design/globals.css; class names are the design system
src/components/                TopBar, TabBar, Toast, IndexRow, Headline, Cover, GeneratedCover,
                               MetaTable, Dock, KapowarrButton
src/clients/                   one folder per service: komga, metron, comicvine, kapowarr, ntfy
src/jobs/                      scheduled jobs
src/db/                        schema, migrations, seed-mock script
src/lib/                       matching, recommendations, services (data access used by pages)
docs/api-notes/                one short note per integration (written before the client)
docs/design/                   preview.html, globals.css, sample-data.json, screenshots/, reference image
gutter/                        Home Assistant app metadata, Configuration UI schema, docs and translations
scripts/start.mjs              shared container entrypoint; maps HA options to the existing env contract
.github/workflows/             multi-architecture Home Assistant app image publishing
```

## Rules
1. **UI fidelity.** Reuse the class names and markup structure from `docs/design/preview.html`. Do not invent new styling, spacing, colours or components. If something is needed that the preview does not show, build it from the existing classes and components, and say so in your summary.
2. **Colours only from tokens** in `:root` of `globals.css`. Never hardcode a colour in a component.
3. Each service has one typed client in `src/clients/<name>/` (zod schemas + tests). UI and jobs never call these services with raw `fetch`.
4. Before writing a client, write `docs/api-notes/<name>.md` from the official docs or a real response. Never guess endpoints or field names; if unsure, leave `TODO(verify)` and ask.
5. Metron and ComicVine calls go through a shared rate-limited queue and a DB cache. Never call them per page load.
6. English only: filter on Metron at query time.
7. Jobs are idempotent. Notifications use a unique `dedupe_key`, so re-running a job never sends duplicates.
8. Pages read data only through `src/lib/services/*`. Swapping mock data for live data must not change any component.
9. Config comes from env vars validated in `src/env.ts`. Never log secrets.
10. Only notify for series with `match_status = confirmed | auto`, never `unmatched`.
11. Run `pnpm lint && pnpm typecheck && pnpm test` before finishing. Fix failures; never skip tests.
12. If you change structure (folders, scripts, env vars, jobs), update this file in the same change.

## Design (summary; full spec in docs/DESIGN.md)
- Light theme only. Background `#ffffff`, text `#252422`, accent `#EB5E28`, Playfair Display everywhere.
- "Index + Stage": narrow numbered index on the left, large stage on the right, hairline rules, radius 0 (except pills), no shadows.
- The accent is for state and actions only. It fails contrast for small text, so never use it for small text. Text on accent buttons is `#252422`.
- Every page needs loading and empty states in the same visual language (hairline skeleton rows; one Playfair sentence and one link).

## Deployment (Docker)
- Multi-stage `Dockerfile` using Next.js `output: "standalone"`, plus `docker-compose.yml` and `.env.example`.
- One service, one container. The scheduler runs inside the app process.
- Mount a volume at `/data` for the SQLite DB (`/data/app.db`). Data must survive rebuilds.
- Run DB migrations automatically on container start, before the server starts.
- Pass `TZ` through so cron schedules fire in local time.
- Expose `GET /api/health` (200 when app and DB are up) and wire it to the compose `healthcheck`.
- Config only via env vars from `.env`. Never bake secrets into the image.
- Other services (Komga, Kapowarr, ntfy) may run in other containers. Their URLs come from env vars (service names on a shared Docker network, or host IPs). Never assume `localhost`.
- `APP_BASE_URL` must be reachable from the phone, because ntfy click links use it.
- Compose includes a commented-out example of joining an external Docker network.

## Env vars
`KOMGA_URL`, `KOMGA_API_KEY`, `METRON_USER`, `METRON_PASSWORD`, `COMICVINE_API_KEY`, `KAPOWARR_URL`, `KAPOWARR_API_KEY`, `NTFY_URL`, `NTFY_TOPIC`, `NTFY_TOKEN` (optional), `APP_BASE_URL`, `WEEKLY_DIGEST_CRON` (default `0 9 * * 3`), `RELEASE_CHECK_CRON` (default `0 */6 * * *`), `TZ`, `RECOMMENDATION_SEED_COUNT` (default `5`), `RECOMMENDATION_EXCLUSION_DAYS` (default `14`)

## Commands
`pnpm dev`, `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm db:generate`, `pnpm db:migrate`, `pnpm db:seed-mock`, `pnpm test:visual`

## M2 implementation notes
- `pnpm dev` reserves port 3000 and uses `.next-dev`; production builds use `.next`. The visual suite uses port 3001, .next-visual and its own database, so it can run beside the port 3000 development server. Never delete an active server's output directory or run multiple development servers on the same port.
- `instrumentation.ts` starts the hourly `sync-komga` schedule in the app process and performs one initial sync.
- `src/lib/services/library.ts` reads the synced Komga cache; before the first successful sync, the library page shows its real empty/setup state and never falls back to design sample data.
- The selected Komga library ID and name are stored in `kv_cache` under `settings:komga-library`; Settings shows the saved selection immediately, selection immediately re-syncs the cache, and all later Komga syncs send the documented library filter.

## M3 implementation notes
- `src/lib/rate-limit-queue.ts` is the shared serial limiter for Metron (and future ComicVine) calls. Use a service rather than calling either client from a page.
- Metron search and issue data are cached in `kv_cache`; pages read the `issues` table only. A follow may perform matching, but page loads never call Metron.
- Komga metadata is retained in `komga:series` cache for matching. The documented Komga metadata ID field is still `TODO(verify)` in `docs/api-notes/metron.md`.

## M5 implementation notes
- `src/clients/kapowarr/` owns Kapowarr's typed API client; it reuses an existing ComicVine volume and only starts an auto-search after an explicit Send action.
- `src/clients/comicvine/` is a fallback used only when a matched Metron series has no `cv_id`; its searches share the metadata rate limiter and SQLite cache.
- Missing issues are released, unowned, ordinary numbered Metron issues. `future_only` excludes issues released before the follow was created; annuals and variants are excluded.

## M6 implementation notes
- Recommended for you uses the same `discover:pool` locally, with cached `year_began` and `issue_count` when available. It scores 3–5 random Komga/followed seeds and draws weighted picks from the best 50, with seed and publisher caps. `discover:recommended-history` tracks `last_shown_at` for the exclusion window and `discover:recommended-day` fixes picks for the local day. The refresh action and daily midnight job check art for at most ten selected candidates through the existing Metron issue-preview cache; rendering Discover never calls Metron for recommendations.
- Page reads never rotate Recommended picks: only the midnight/startup/manual refresh saves a new set after checking art. When no new covers are available, keep the previous covered set. Startup retries a cached all-coverless set when Metron is configured.
- Reading cards use cached Komga `books/list` records and their documented `readProgress`; when no live Komga cache exists, the dashboard shows a setup message rather than invented statistics.
- Discover results are generated weekly (and once after the initial Komga sync when no cache exists), cached in `kv_cache`, and refreshed by the explicit Discover action. The random section rotates through up to 200 candidates in the `discover:pool` cache and samples up to five English Metron series pages only when the pool is thin or on the weekly refresh. It checks issue covers only for selected candidates, caches those checks, and limits each refresh to ten new issue previews. Metron calls stay behind the shared metadata limiter, which observes quota headers.
- A Discover follow is stored as a confirmed Metron-backed follow using the `discover:<metron-series-id>` sentinel, since the recommendation deliberately is not already in Komga. Dismissed Metron IDs are persisted in `kv_cache` and excluded at later refreshes.
- Runtime pages never read `docs/design/sample-data.json`; migrations remove legacy `mock:*` cache entries. The design seed remains a development-only visual reference.
- Startup runs Komga sync, then Discover refresh only if no recommendations are cached. Release refresh follows its configured cron schedule or the Settings action. The SQLite migration also upgrades legacy databases missing `publisher` or `owned` columns.

## Follow-up implementation notes
- M01 adds a PWA manifest and token-colour placeholder icons, an unmatched-follow badge linking to the Library attention filter, shared j/k/arrow list navigation, and ntfy-only job-failure/recovery alerts after two consecutive failures. The job alert cannot detect the whole process being down. Replace the placeholder icon with the user's approved artwork when available.
- Discover and dashboard recommendation cards share `RecommendationActions` for one-line Follow and Download volume controls. `POST /api/discover/[id]/kapowarr` creates the Metron-backed follow, reuses its Metron `cv_id` when present, then calls the existing Kapowarr add-and-search service; a retry can use an already-followed row.
- `src/db/migrate-schema.ts` applies idempotent schema upgrades when the app opens SQLite; `pnpm db:migrate` uses the same upgrades for explicit or container-start migration. Development does not require a separate migration command.
- `followed_series.active` and `issues.active` preserve notification history when a series is unfollowed or rematched. Library, Discover, missing issues, and scheduled jobs use active rows; notifications can still show historical rows.
- `src/jobs/status.ts` records job state and last successful run in `kv_cache` and prevents overlapping runs in the single app process. Settings can start Komga sync and release refresh through `POST /api/jobs/[name]`.
- `src/lib/http.ts` applies request timeouts and honors `Retry-After` for safe retryable calls. Non-idempotent sends use a single attempt.
- `pnpm test:visual` starts its own server on port 3001 with `.next-visual` and `data/visual-test.db`. `GUTTER_VISUAL_TEST=1` is an internal test-only switch that disables scheduled jobs and selects this output folder; it is not deployment configuration. The test seeds its own database and resets notification read state before each screenshot. Current application baselines are in `tests/visual/snapshots/`; the original approved preview images remain in `docs/design/screenshots/`.


## M02 issue controls and progress
- `POST /api/issues/[id]/skip` validates `{ skipped: boolean }` and changes `issues.skipped_at` for active issues of active follows. Repeated skips preserve their timestamp; unskip clears it. Series issues has a Skipped filter and a reversible issue action.
- The shared `excludedIssue` helper excludes skips, annuals, variants, and nonnumeric issues from missing issues, release notifications, weekly digests, and collection progress. M04's coming-up strip should use this same helper when implemented.
- Series progress reads SQLite only and counts active eligible issues released through today in `TZ`. Advance copies do not inflate owned/released. Zero released issues show an empty state. Unknown/hiatus/ongoing status can be Up to date; only verified Metron Completed/Cancelled status can be Complete.
- Metron series detail status is normalized and cached during match/import and refreshed with releases. Issue upserts preserve skip timestamps by Metron issue ID, including rematches; unrelated issues do not inherit them.
- `drizzle/0000_m02_issue_controls.sql` records the milestone's nullable columns; its snapshot establishes the existing schema for future diffs. Runtime and `pnpm db:migrate` continue using the equivalent idempotent upgrades in `src/db/migrate-schema.ts`; do not run the raw ALTER migration again on an already-upgraded database.
- M02 extends the preview's series view, filters, issue action, and token-based progress rule. Progress and mobile skip snapshots are in `tests/visual/snapshots/`. Run typecheck before starting the visual suite, whose startup regenerates its Next type files.

## M03 backups and follows transfer
- `BACKUP_CRON` (default `30 3 * * *`, validated cron) and optional `BACKUP_DIR` are validated in `src/env.ts`. The directory defaults to `backups/` beside `GUTTER_DB_PATH`. `backup-db` is a tracked job scheduled in `instrumentation.ts`, exposed by `POST /api/jobs/backup-db`, and shown in Settings with Run now.
- `src/jobs/backup-db.ts` uses SQLite's online backup API into a temporary file, then renames the completed copy to `gutter-YYYY-MM-DD.db` using `TZ`. Only the newest seven dated regular files are retained. A same-day repeat replaces that copy. Use a separate mounted disk/path for real protection; the default shares the data volume.
- `GET /api/export/follows` downloads version 1 JSON. `POST /api/import/follows` validates up to 5 MB, upserts by Komga series ID, reactivates included rows, retains other follows and notification history, imports issues for matched rows, and reapplies ownership. Titles/publishers and created_at preserve useful display data and future-only cutoffs. Inactive flags are exported for reference; import reactivates them as specified. Discover sentinel IDs are preserved. Import never sends to Kapowarr.
- `src/lib/services/follows-transfer.ts` handles transfer through the shared operation queue used by jobs. `import-skips.ts` consumes durable `import:skips:<follow-id>` cache entries as matching issues arrive; failed metadata refreshes report a pending count. Normal release refresh retries them. Once applied, pending skip IDs are removed so a later Unskip remains effective. Existing skip choices are merged, never cleared by import.
- Settings reuses preview sections, service rows, and file-input tools; `FollowsTransfer` provides download, upload, busy state and a result toast plus persistent summary. No schema migration is needed. Visual backups use the isolated `data/visual-backups` directory.

## M04 coming up and date changes
- `issues.previous_date` and `issues.date_changed_at` record the latest change between two known Metron dates for an unowned issue. A first announced date is not marked as moved. The idempotent runtime migration and `drizzle/0001_eminent_vance_astro.sql` add these nullable columns.
- `getUpcomingIssues()` reads only active matched cache rows, excluding owned, skipped, annual, variant, and nonnumeric issues, for the next 30 local days. The dashboard groups its strip by calendar week and labels date moves from the last 14 days.
- The weekly digest includes a Moved section for eligible changes since the last sent digest when either date is today or later. A slip-only week sends; an empty week does not. The weekly dedupe key remains unchanged.

## M05 Kapowarr loop
- `KAPOWARR_CHECK_CRON` (default `*/15 * * * *`) schedules `check-kapowarr`. Optional `ACTION_SECRET` (at least 32 characters) enables ntfy action buttons.
- The job reads Kapowarr only for active matched follows with a saved volume and missing released issues. It caches status in `kv_cache`; series pages read the cache only.
- A files-ready transition requests a selected-library Komga scan at most once per 30 minutes. The hourly sync reads completed scans. The first sync after library selection establishes an ownership baseline without arrival alerts. Later arrivals send one best-effort ntfy message per series per sync.
- Settings also exposes `POST /api/jobs/scan-komga` as a manual selected-library file scan, separate from the library data sync. Komga's 202 only accepts a scan; the existing hourly sync reads finished scans. Pending Kapowarr completions persist through the automatic 30-minute debounce and are retried by the next check. A manual scan bypasses debounce and coalesces any pending scan for that library.
- Mark read and Send to Kapowarr ntfy buttons use 30-day HMAC tokens in POST bodies. A Send button tap is an explicit user action; detecting a release alone never starts a Kapowarr download. Repeat taps on a saved Kapowarr volume do not start another search.

## M06 reading and Discover
- Library's "Reading, not following" strip uses cached Komga books with two dated completed reads within 60 days, at most four unfollowed, undismissed series. Dismissals persist in `kv_cache` under `follow-suggestions:dismissed`; Follow reuses `/api/follows`.
- Recommendation cache entries may carry optional structured `why` provenance (writer, publisher, random). Existing entries without it remain valid and show no new reason line until refreshed. Candidate writers are used only when both cached sides identify the same writer; no extra page-load metadata calls.
- `/recap` and `/recap/[year]` read only cached Komga completion dates, grouped by `TZ`. Undated/in-progress books are excluded from year, streak, and month calculations. Recap is linked from the dashboard, not the nav; no new DB schema or job is required.
- `tests/visual/render-m06-preview.mjs` renders the M06 additions in the approved preview at desktop and mobile sizes into `docs/design/screenshots/`. The app's M06 visual baselines are in `tests/visual/snapshots/`.

## Home Assistant app packaging
- `repository.yaml` and `gutter/config.yaml` make this GitHub repository installable as a Home Assistant app repository. The app uses an exposed configurable port, not Ingress, because the Next.js build assumes root-relative asset paths.
- `scripts/start.mjs` reads `/data/options.json` when Supervisor provides it, maps app options to the validated environment variables, fixes the database at `/data/app.db`, runs migrations, and starts the standalone server. Without that file, the same image continues to use Docker Compose environment variables.
- `gutter/config.yaml` and `gutter/CHANGELOG.md` versions must be bumped together before publishing an app update. `.github/workflows/home-assistant-app.yaml` publishes `amd64` and `aarch64` images to `ghcr.io/terugrit/gutter`.

## M07 reading shelf
- `/shelf` is a persistent Metron-series bookmark grid. `reading_shelf` snapshots title, publisher, start year, cover, and save time; it is separate from `followed_series`. The idempotent runtime migration and `drizzle/0002_perpetual_boomer.sql` add the table.
- Dashboard and Discover use the shared recommendation actions to save. A save reads cached metadata, performs no external call, and does not follow or download. Old recommendation caches without `yearBegan` remain valid; unknown years remain unknown.
- The six-link desktop and mobile navigation includes Shelf between Library and Notifications. At 420px and below, the mobile tab bar scrolls horizontally in one row and brings the active link into view.
- Shelf send reuses the Metron-backed follow and Kapowarr add-and-search service, and leaves the card saved. Removal affects only the shelf. Pages read shelf data through `src/lib/services/reading-shelf.ts`.

## Notification removal
- `notifications.deleted_at` is a soft-delete timestamp. Notification pages, unread counts, and oldest-date summaries exclude hidden rows, while release delivery deduplication continues to use the retained record.
- The notification index exposes Clear all; a selected notification exposes Delete and then moves to an adjacent visible notification when available.

## M08 Coming Soon and release shelf
- `upcoming_releases` is the local 30–45 day Metron solicitation pool. `watches`, `dismissed_series`, `interest_filters`, and `interest_weights` hold user intent and feedback; page renders never query Metron.
- The existing M07 `reading_shelf` remains the saved-series bookmark table. M08's issue staging queue is `release_shelf`; `/shelf` shows released watched issues first and saved series second so both established workflows remain available.
- `refresh-upcoming-releases` runs daily at 05:30, `check-release-dates` daily at 06:00, and `tune-interest-weights` weekly Sunday at 06:30 in `TZ`. Kapowarr's existing poll advances and soft-removes release-shelf rows.
- Metron does not expose a documented solicitation-confidence flag. Date-range candidates therefore default to `solicited`; do not infer `confirmed` from proximity to release.
- A watch follows the Metron series but never sends it to Kapowarr. Automatic release detection sends a notification and stages the issue; starting a Kapowarr search remains an explicit user action elsewhere in the app.

## Shared series detail overlay
- Dashboard, Discover, Coming Soon, and shelf cards use the single `SeriesDetailOverlayProvider` mounted in the root layout. Clickable card bodies expose `data-series-detail` with `metron:<id>`, `comicvine:<id>`, or `komga:<id>`; nested action links and buttons remain independent.
- `GET /api/series/[id]` reads followed issues and SQLite metadata caches first, using indexes on the external series IDs and followed issue ID. Missing Metron detail goes through the existing cached/rate-limited metadata service, with the existing queued ComicVine search as fallback. The `?series=` URL state is updated with `history.replaceState`, so opening or closing details does not rerender the page or move its scroll position.
- Overlay descriptions come only from ComicVine volume detail (`description`, then `deck`), never Metron `desc`. Known `cv_id` values are used directly; missing IDs use the existing cached ComicVine volume search. Detail calls share the metadata limiter, are cached by volume ID, and their HTML is converted to plain text before rendering.
