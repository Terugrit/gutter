# Gutter project guide

This guide records the current implementation. `AGENTS.md`, `docs/PLAN.md`,
`docs/DESIGN.md`, and `PLAN_FOLLOWUPS.md` set the requirements; the approved
markup and tokens live in `docs/design/preview.html` and
`docs/design/globals.css`.

## Runtime and configuration

Next.js runs the UI and API in one Node process. SQLite lives at
`GUTTER_DB_PATH` (`/data/app.db` in production); `src/db/migrate-schema.ts`
upgrades it when opened. `src/env.ts` validates service URLs and credentials,
`APP_BASE_URL`, `TZ`, the release and weekly cron expressions, and recommendation
settings. Secrets stay on the server.

The app publishes `/manifest.webmanifest` with standalone display and 192,
512, and maskable placeholder icons. `/apple-touch-icon.png` is provided for
iOS. These icon files need replacement with the user's approved artwork. The
app has no service worker or offline cache. A true browser install needs HTTPS
or localhost; a plain HTTP LAN address may create only a shortcut.

## Data and routes

`followed_series` stores Komga and metadata IDs, `match_status`, `active`, and
monitoring mode. `issues` stores cached releases and ownership; `notifications`
stores release and digest delivery history with unique dedupe keys. `kv_cache`
holds Komga and Metron caches, recommendations, selected settings, and job
status. Unfollowing keeps inactive history.

The root layout reads `getAttentionCount()` once per render. It counts active
follows whose match status is neither `auto` nor `confirmed`. The Library badge
links to `/library?followed=1&attention=1`; each filtered card links to its
existing `/series/[id]` match controls. The badge is absent at zero.

The shared list hook in `src/components/use-list-navigation.ts` handles j/k and
arrow keys, Enter, and mobile Escape for the dashboard missing list,
notifications, Discover, and the series issue index. It leaves typing and
native button/link Enter behavior alone. Library remains a two-dimensional
grid without this navigation.

## Jobs and alerts

`src/instrumentation.ts` runs the first Komga sync and registers the hourly
Komga sync, release refresh, weekly digest, weekly Discover refresh, and daily
recommendation refresh using `TZ`. `src/jobs/status.ts` serializes and tracks
these jobs in `kv_cache`. Settings can run Komga sync and release refresh
manually; those runs count toward failures just like scheduled runs.

After two consecutive failures, a tracked job sends one high-priority ntfy
warning with the final error truncated to 200 characters and a Settings click
link. A failed ntfy send is logged and retried on the next failed run. A
successful run resets the streak and sends a recovery notification when a
warning was sent. These system alerts are ntfy-only, with no notification
table rows. They cannot detect the entire app process being down.

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
- `issues.previous_date` and `issues.date_changed_at` keep the latest known-date change for an unowned issue. First date announcements are not marked as moved. The idempotent runtime migration and `drizzle/0001_eminent_vance_astro.sql` add both nullable columns.
- `getUpcomingIssues()` reads active matched cached issues in the next 30 local days, using the shared exclusion helper. The dashboard groups them by week and marks moves from the last 14 days.
- The weekly digest includes a Moved section for eligible changes after the last sent digest when either date is today or later. Slip-only weeks send; empty weeks skip. It uses the existing weekly dedupe key.

## M05 Kapowarr loop

`KAPOWARR_CHECK_CRON` (default `*/15 * * * *`) schedules `check-kapowarr`, which reads `/api/volumes/{id}` and `/api/activity/queue` only for active matched follows with a Kapowarr volume and missing released issues. It stores a short-lived `kapowarr:status:<follow-id>` entry in `kv_cache`. The series status line reads only this cache. Settings can run the check manually.

When a status transitions to files-ready, the job asks Komga to scan the selected library, with a 30-minute `kv_cache` debounce. The hourly sync reads completed scans. A per-library ownership baseline suppresses alerts on first sync after selection. Later newly owned missing issues produce one best-effort ntfy message per series per sync; no notification row or retry is created.
Settings has a separate **Scan library files** action for Komga; it requests a selected-library scan even during the automatic debounce. Komga's 202 only means accepted: the hourly Gutter sync reads completed scan results. Kapowarr ready transitions leave a durable pending scan when throttled and retry it on later checks; the UI's status expiry does not erase the last observed transition.

Optional `ACTION_SECRET` (minimum 32 characters) enables ntfy HTTP buttons. New-release notifications have Mark read, plus Send to Kapowarr when a ComicVine ID exists and no Kapowarr volume is stored. Each button sends a 30-day HMAC token in the POST body to `/api/actions/mark-read` or `/api/actions/send-kapowarr`. The token authorizes only that action and notification. A button tap is an explicit Kapowarr send; receiving a notification never starts a download. Settings reports whether buttons are on.

## M06 reading and Discover

`src/lib/services/follow-suggestions.ts` derives up to four eligible unfollowed series from `komga:books` with at least two dated completed reads in the last 60 days. `/api/follow-suggestions/[id]/dismiss` saves a permanent `follow-suggestions:dismissed` cache entry. The Library strip uses `/api/follows` for Follow and hides when empty.

Recommendations keep the old string `reason` for cache compatibility and add an optional structured `why` object for the new card and preview explanation. Missing `why` displays no new line. Metadata reads remain in the existing rate-limited refresh pipeline.

Recommended page reads do not rotate the daily set. Midnight, startup or manual refresh checks candidate covers (at most ten new previews) before saving new picks. If none has art, the previous covered set remains; startup retries an all-coverless cache when Metron is configured. This fixes an earlier read-time rotation that replaced every Recommended cover with an empty URL.

`/recap` defaults to the current local year; `/recap/[year]` selects another year. `src/lib/services/recap.ts` aggregates completed Komga book `readDate` values in `TZ`. Only years with dated reads are listed. Series finished requires every cached book to have a dated completion. No schema migration, cron, or additional Komga API call is needed.
