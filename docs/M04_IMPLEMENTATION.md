# M04 implementation

Completed 2026-09-25: Coming up and date changes from the follow-up plan.

## Behavior and decisions

- The dashboard reads a cached, date-sorted 30-day window through `getUpcomingIssues()`. It groups covers by Monday week and uses the shared issue exclusion helper. Only active, matched follows and active, unowned issues appear; future-only monitoring keeps its follow-date cutoff.
- An existing unowned issue changing from one known Metron date to another stores its old date in `previous_date` and the change time in `date_changed_at`. The same date on later imports keeps the original change time. A first date announcement and a change to an unknown date are not called a move.
- The dashboard and series index show "moved" for 14 days. The series row reveals the old date on hover or keyboard focus.
- The weekly digest includes eligible changes made after the last sent digest when either date is still current or future. It sends for slips alone, skips empty weeks, and retains `weekly-digest:<Monday>` deduplication. The digest continues to use ntfy only.
- The new strip and moved tag were added to the design preview and rendered in desktop and mobile reference screenshots. They use the existing strip, cover, section, and token styles. There is no new color or library.

## Files changed

- Schema and migration: `src/db/schema.ts`, `src/db/migrate-schema.ts`, `drizzle/0001_eminent_vance_astro.sql`, Drizzle snapshot and journal.
- Data and jobs: `src/lib/services/metron.ts`, `src/lib/services/upcoming.ts`, `src/lib/services/series.ts`, `src/jobs/weekly-digest.ts`.
- UI and design: `src/app/page.tsx`, `src/app/series/[id]/series-client.tsx`, the three design CSS copies, `docs/design/preview.html`, and new M04 preview screenshots.
- Tests: `tests/coming-up.test.ts`, `tests/visual/routes.spec.ts`, and new desktop/mobile Coming up snapshots.
- Documentation: `AGENTS.md`, `PROJECT_AGENT_GUIDE.md`, `docs/DESIGN.md`, and this report.

## Verification

- `pnpm lint`, `pnpm typecheck`, and `pnpm test`: passed (52 tests).
- `pnpm test:visual -- --update-snapshots`: 26 passed; new Coming up snapshots were inspected.
- Local Metron and ntfy behavior was exercised through MSW. A live Metron refresh, live ntfy delivery, and production Docker upgrade were not exercised.

## Open verification

No new `TODO(verify)` items. Existing integration verification items remain unchanged.
