# Gutter: follow-up implementation plan

Scope: 14 additions on top of the current app. Work **one milestone at a time**, in order. Read `AGENTS.md`, `docs/PLAN.md`, `docs/DESIGN.md` and `PROJECT_AGENT_GUIDE.md` first.

Explicitly **out of scope**: authentication, per-series annuals/one-shots toggle, any change to the guide's prose beyond keeping it accurate.

## Rules for every milestone

- Preserve the invariants: `active` history semantics, auto/confirmed-only alerts, dedupe keys, future-only cutoff, **explicit** Kapowarr sends, English Metron filtering, server-side secrets, cached metadata reads, no runtime fallback to sample data.
- New UI only exists after it is in the approved preview (Milestone 0). Reuse preview markup and tokens from `src/app/globals.css`. No new colors, shadows, libraries.
- Integration changes: verify the real API first and write `docs/api-notes/<service>.md` before the client code. Anything unverified stays marked `TODO(verify)`. Do not guess endpoint or field names.
- Every new page/strip needs loading, empty and keyboard states.
- One Drizzle migration per milestone that needs one. Nullable columns or defaults only, so existing databases upgrade in place.
- Definition of done: `pnpm lint && pnpm typecheck && pnpm test`, plus `pnpm test:visual` with baselines updated **only** for intended changes. Update `AGENTS.md` and the matching sections of `PROJECT_AGENT_GUIDE.md` (jobs, routes, env vars, tables) in the same change. Final report lists files changed, decisions, preview deviations, remaining `TODO(verify)`, and anything unverified.

## Milestone overview

| # | Milestone | Items | Migration |
| --- | --- | --- | --- |
| 0 | Design gate | preview additions for every new UI element | none |
| 1 | Quick wins, no schema | PWA install, needs-attention badge, j/k keyboard nav, job-failure alert | none |
| 2 | Issue controls and progress | skip issue, series progress bar / complete state | yes |
| 3 | Backup and export | nightly DB copy, follows export/import | none |
| 4 | Coming up and date changes | coming-up strip, slipped-date alerts | yes |
| 5 | Kapowarr loop | status feedback, auto Komga scan, arrival ntfy, ntfy action buttons | none |
| 6 | Reading and Discover | follow suggestions, "why this?", reading recap | none |

---

## Milestone 0: Design gate (user approval required)

Deliverable: extend `docs/design/preview.html`, its CSS and `docs/design/screenshots/` with the elements below, using existing tokens only. **Stop and get approval before Milestone 1 UI work.** Milestone 1 items without UI (job-failure alert) may start earlier.

New elements to design (desktop and mobile where relevant):

1. Nav badge: small count on the nav item (top nav and bottom tab bar).
2. Dashboard "Coming up" strip.
3. Series header: progress bar plus "Up to date" and "Complete" labels; Kapowarr status line; "Skip / Unskip" control; "Skipped (n)" filter on the issue index; "moved" tag on issue rows.
4. Settings: export/import controls, backup job row, "Action buttons: on/off" status row.
5. Library: "Reading, not following" strip with Follow and Dismiss.
6. Discover: one-line "why this?" on cards and in the hover preview.
7. Recap page (`/recap`), including a 12-month bar strip built from CSS blocks, no chart library.
8. Selected-row style for keyboard navigation (reuse the existing focus/selected look if it already fits).
9. App icon (192, 512, maskable, apple-touch). The user designs this; Codex may only add a temporary placeholder built from the tokens and must flag it.

---

## Milestone 1: Quick wins, no schema

### 1.1 PWA install

- Add `src/app/manifest.ts`: name "Gutter", `display: standalone`, `start_url: /`, white `background_color`, accent `theme_color` (`#EB5E28`), icons from item 9 above. Add apple-touch icon and `viewport` theme color in the root layout.
- No service worker and no offline caching (data is live, and there is no auth).
- Note for the README: browsers only offer a true install over HTTPS or on localhost. On a plain-HTTP LAN address Android just adds a shortcut. A reverse proxy with HTTPS fixes that.
- Acceptance: manifest validates in Chrome DevTools, icons resolve, no console errors.

### 1.2 Needs-attention badge

- Service `getAttentionCount()`: count of `followed_series` where `active` and `match_status` is not `auto`/`confirmed`. Cheap single query, read in the layout.
- Badge on the Library nav item (desktop and mobile) when count > 0. It links to `/library?followed=1&attention=1`.
- Library page: support the `attention=1` filter (unmatched follows only). Each card links to `/series/[id]` where the existing match flow lives.
- Acceptance: badge hidden at 0; disappears after confirming a match; unfollow removes it from the count.
- Tests: service unit test; visual snapshot with a seeded unmatched follow.

### 1.3 Keyboard j/k navigation

- One shared hook, `src/components/use-list-navigation.ts`: `j`/`ArrowDown` next, `k`/`ArrowUp` previous, `Enter` opens, `Escape` returns to the list on mobile detail views.
- Apply to Index lists: dashboard missing list, `/notifications`, `/discover`, `/series/[id]` issue index. Library grid is excluded (2-D grid).
- Ignore key events when focus is in `input`, `textarea`, `select`, `[contenteditable]`, or when any modifier key is held. Must not break existing Tab and Enter behavior.
- Selected row exposes `aria-current="true"` and scrolls into view.
- Tests: Playwright covers j, k, Enter, and typing "j" in the Library search box (must not navigate).

### 1.4 Alert on job failure

- Extend `src/jobs/status.ts`. Job state in `kv_cache` gains `consecutiveFailures` and `failureAlertedAt`.
- On failure: increment. When it reaches **2** (constant `JOB_FAILURE_ALERT_AFTER`) and no alert has been sent for this streak, send one ntfy: high priority, warning tag, title "Gutter: <job> is failing", body is the last error trimmed to 200 characters, click URL `${APP_BASE_URL}/settings`. Then set `failureAlertedAt`.
- If the ntfy send itself fails, log only. Never throw, never recurse, and do not set `failureAlertedAt`, so the next failure retries.
- On success: reset the counter. If an alert had been sent, send one "Gutter: <job> recovered" ntfy at default priority and clear `failureAlertedAt`.
- Manual "Run now" runs count the same as scheduled runs.
- No new table and no `notifications` rows; these alerts are ntfy-only.
- Known limit, documented in the guide: this cannot detect the whole process being down.
- Tests (Vitest with a fake ntfy): fail, fail → one alert; third failure → no second alert; success → recovery message; ntfy down → retried on next failure.

---

## Milestone 2: Issue controls and progress

Migration: `issues.skipped_at` (nullable integer), `followed_series.series_status` (nullable text).

### 2.1 Skip an issue

- `POST /api/issues/[id]/skip` with `{ skipped: boolean }`, validated with zod; sets or clears `skipped_at`.
- Skipped issues are excluded from the dashboard missing list, the coming-up strip, new-release alerts and the weekly digest. Extend the single eligibility helper rather than adding separate filters.
- Series page: Skip/Unskip control per issue and a "Skipped (n)" filter so mistakes are reversible.
- Rematch: if rows are reactivated by the unique `metron_issue_id`, the flag persists naturally. Verify that in code. If rows are recreated, copy `skipped_at` over only when the Metron series ID is unchanged.
- Tests: eligibility helper cases; job does not notify a skipped issue; skip then unskip restores it.

### 2.2 Series progress bar and complete state

- Service returns `{ owned, released, total, state }` for the series header. Count only ordinary-numbered, active issues (same exclusions as the missing list). `released` are dated no later than today in `TZ`.
- Bar shows `owned / released`. State labels: **Up to date** (owned equals released, series still ongoing) and **Complete** (owned equals released and Metron says the series has ended).
- Store Metron's series status in `series_status` during match/issue import. Check `docs/api-notes/metron.md` for the real field name and values first; treat the ended/ongoing mapping as `TODO(verify)` until confirmed. If unknown, show Up to date only, never Complete.
- Skipped issues are excluded from both counts.
- Tests: service unit tests for each state; visual snapshot for all three.

---

## Milestone 3: Backup and export

### 3.1 Nightly database copy

- New tracked job `backup-db` in `src/jobs`, scheduled by `BACKUP_CRON` (default `30 3 * * *`, uses `TZ`).
- Use SQLite's online-safe copy (`VACUUM INTO`, or the driver's backup API) to write `gutter-YYYY-MM-DD.db` into `BACKUP_DIR` (default: `backups/` next to the DB file, `/data/backups` in Docker). Never copy the live file with `fs`.
- Keep the newest 7 copies and delete older ones. The retention count is a constant.
- Register in `instrumentation.ts`, `src/jobs/status.ts` and the Settings job list, with Run now.
- Document in the README: the default lives in the same volume, so for real protection mount `BACKUP_DIR` on another disk or path.
- Tests: job creates a valid, openable copy; rotation keeps 7.

### 3.2 Follows export and import

- `GET /api/export/follows`: JSON download containing per follow `komga_series_id`, Metron/ComicVine/Kapowarr IDs, `match_status`, `monitor_mode`, `active`, plus skipped `metron_issue_id`s. Include a `version: 1` field. No secrets, no notification history.
- `POST /api/import/follows`: validate with zod, then upsert by `komga_series_id` (insert missing, reactivate existing, never delete). Trigger the normal issue import for matched rows and reapply ownership. Discover sentinel follows (`discover:<id>`) import as-is.
- Settings: "Download follows" and "Import follows" (file input, result summary toast).
- Tests: round-trip export → wipe → import restores follows and skips; malformed file is rejected with a clear message.

---

## Milestone 4: Coming up and date changes

Migration: `issues.previous_date` (nullable), `issues.date_changed_at` (nullable integer).

### 4.1 Coming up strip

- Service `getUpcomingIssues(days = 30)`: active, unowned, unskipped, ordinary-numbered issues dated **after** today in `TZ` and within `days`, for follows with `match_status` `auto`/`confirmed`, sorted by date. Reads cache only; no Metron calls.
- Dashboard strip (design from Milestone 0) grouped by week. Empty state: a single quiet line.
- Show a "moved" tag if `date_changed_at` is within the last 14 days.

### 4.2 Slipped-date alerts

- During issue refresh/import: when Metron's date for an existing, unowned issue differs from the stored non-null date, set `previous_date` to the old date and `date_changed_at` to now. A null → date change is an announcement, not a slip; do not flag it.
- Weekly digest gains a "Moved" section: `Series #7: 12 Oct → 26 Oct`. Include only issues whose `date_changed_at` is after the last sent digest and where the old or new date is today or later.
- A week with slips but no new releases now **still sends** a digest. Weeks with neither remain skipped. Keep the single `weekly-digest:<week-Monday>` dedupe key.
- Series issue rows show the "moved" tag with the old date on hover/focus.
- Tests: refresh with a changed date sets the columns; null→date does not; slip-only week sends; empty week still skips; digest is not sent twice.

---

## Milestone 5: Kapowarr loop

Order inside this milestone matters: 5.1, then 5.2, then 5.3.

### 5.1 Kapowarr status feedback

- First write `docs/api-notes/kapowarr.md` from the real API: how to read a volume's issues/files, the download queue, and how to start a library scan. Endpoint and field names are `TODO(verify)` until then.
- Add typed methods to `src/clients/kapowarr` with zod schemas. Service function `getKapowarrStatus(followId)` returns `{ state: 'idle' | 'downloading' | 'files-ready', queued, filesHave, filesTotal }` and caches it in `kv_cache` (`kapowarr:status:<followId>`, short TTL). Page renders read the cache only.
- New tracked job `check-kapowarr` (`KAPOWARR_CHECK_CRON`, default `*/15 * * * *`) refreshes status for follows that have a `kapowarr_volume_id` and at least one missing released issue. It does nothing otherwise. Add to Settings job list.
- Series page shows one status line, e.g. "Sent to Kapowarr · 2 downloading · 12 of 20 files".
- Tests: client tests with MSW fixtures from real responses; job skips follows with no volume ID.

### 5.2 Komga scan and arrival ntfy

- Add `scanLibrary(libraryId)` to the Komga client (api-note first). When `check-kapowarr` sees a follow move to `files-ready`, call it once for the selected library, then queue `sync-komga`. Debounce: at most one scan per 30 minutes (`kv_cache` key). The hourly sync remains the fallback.
- In `sync-komga`, compare owned issue IDs before and after ownership is reapplied. For issues that became owned, belong to a follow with a `kapowarr_volume_id`, and were previously missing, send **one ntfy per series per sync**: "3 new issues of <series> are in Komga", click URL `${APP_BASE_URL}/series/<id>`.
- These are best-effort ntfy messages. No `notifications` row and no retry, by design. Skip entirely on the first sync after library selection (no prior owned state).
- Tests: newly owned issue triggers exactly one message; first sync sends nothing; a follow without a volume ID sends nothing; scan debounce holds.

### 5.3 ntfy action buttons

- Extend `src/clients/ntfy` to serialize up to two `http` actions in the ntfy `Actions` header.
- New env `ACTION_SECRET` (optional). If unset, buttons are simply omitted and the click URL still works; Settings shows "Action buttons: off (set ACTION_SECRET)".
- `src/lib/action-token.ts`: HMAC-SHA256 token over `{ action, notificationId, expiresAt }`, base64url, constant-time compare, 30-day expiry. Token travels in a request header or body, never the URL query.
- `POST /api/actions/send-kapowarr` and `POST /api/actions/mark-read`. Each validates the token, then calls the existing service (`sendToKapowarr` already adds or reuses, so repeat taps are safe; mark-read only sets `read_at` if empty). Wrong or expired token → 403/410 with no detail.
- New-release notifications include "Mark read" always, and "Send to Kapowarr" only when the follow has a ComicVine volume ID and no `kapowarr_volume_id` yet. A tap is an explicit user action, so the "no automatic Kapowarr send" invariant holds. Document that in `AGENTS.md`.
- The token only authorizes those two actions for that one notification; it is not an API key.
- Tests: token round trip, tampering, expiry; each route with a valid and invalid token; buttons absent when the secret is unset.

---

## Milestone 6: Reading and Discover

### 6.1 Follow suggestions from reading

- Service computes from cached `komga:books` only: unfollowed (no active follow), series with at least 2 books showing read activity in the last 60 days (both numbers are constants in one file). Return at most 4, most recent first.
- Library page strip "Reading, not following" with Follow (reuses `POST /api/follows`) and Dismiss. Dismissals persist in `kv_cache` (`follow-suggestions:dismissed`) and reset never automatically. Strip is hidden when empty.
- Tests: threshold boundaries, dismissed hidden, followed hidden, no Komga sync → no strip.

### 6.2 "Why this?" on Discover

- The recommendation builder records a reason with each suggestion: `{ kind: 'writer' | 'publisher' | 'random', name, sourceSeries? }` (e.g. "Shares writer Tom King with *Mister Miracle*", "Random pick from Image Comics").
- Extend the cached entry zod schema with `reason` as **optional**, so old caches keep loading and simply show no line until the next Refresh.
- Render the line on cards and in the hover preview. Never invent a reason when none is stored.
- Tests: builder attaches the correct reason; old cache shape still parses.

### 6.3 Reading recap

- New route `/recap` (defaults to the current year) and `/recap/[year]`. Linked from the dashboard reading-stats card, **not** added to the top nav. Only years with reads appear in the switcher.
- Server-rendered from cached Komga `readProgress` data. Stats: books completed, series finished, busiest month (12-block strip), longest reading streak in days, top 3 series by books read.
- Check `docs/api-notes/komga.md` for which `readProgress` date fields really exist. Drop any stat the data cannot support instead of approximating it.
- Empty states: "sync Komga first" before a sync; "no reads this year" afterwards. Never show invented numbers.
- Tests: aggregation unit tests with a fixed `TZ` (month/day boundaries, streak across month end); visual snapshot of the populated and empty page.

---

## New configuration and jobs (keep `AGENTS.md` in sync)

| Item | Default | Notes |
| --- | --- | --- |
| `BACKUP_CRON` | `30 3 * * *` | Milestone 3 |
| `BACKUP_DIR` | `backups/` beside the DB (`/data/backups` in Docker) | Milestone 3 |
| `KAPOWARR_CHECK_CRON` | `*/15 * * * *` | Milestone 5 |
| `ACTION_SECRET` | unset (buttons off) | Milestone 5; long random string |
| Job `backup-db` | | Milestone 3, appears in Settings |
| Job `check-kapowarr` | | Milestone 5, appears in Settings |

## Open `TODO(verify)` items this plan creates

- Metron series status field name and its ended/ongoing values (2.2).
- Kapowarr endpoints for volume files, download queue and any status fields (5.1).
- Komga library scan endpoint (5.2).
- Komga `readProgress` date fields available for the recap (6.3).
- Whether rematching reactivates issue rows by `metron_issue_id` or recreates them (2.1).
