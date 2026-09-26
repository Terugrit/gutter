# M03 implementation

Completed 2026-09-25: nightly database backups and follows export/import.

## Behavior and decisions

- `backup-db` runs at `BACKUP_CRON` (default 03:30 in `TZ`) and through Settings → Run now. It shares tracked job status and failure/recovery alerts.
- Backups use the SQLite driver's online API. A completed temporary copy replaces `gutter-YYYY-MM-DD.db`; failure leaves the previous copy intact. Retention keeps the seven newest dated regular files and leaves unrelated files alone. Canonical path checks protect the live database.
- `BACKUP_DIR` defaults beside the DB, under `backups/`. README explains mounting a separate disk/path and restoring a full database. No deployment was performed.
- Follows download is version 1 JSON containing IDs, title/publisher, match and monitoring choices, active flags, original follow dates, and skipped Metron issue IDs. Credentials and notification history are excluded.
- Import validates the full file before writes, merges by Komga ID, and reactivates included rows, including entries exported as inactive. Other follows and notification history remain. Existing skips are merged, not cleared. Discover IDs remain unchanged and no download is sent to Kapowarr.
- Import refreshes matched issue caches and reapplies ownership only for imported follows. Failed metadata refreshes report a pending count. Pending skip IDs persist in `kv_cache` until the normal issue importer can apply them; consumed IDs are removed so later Unskip actions remain effective.
- Original valid follow dates preserve future-only cutoffs. Legacy invalid dates are omitted from export and repaired on import. The upload limit is 5 MB; malformed files, invalid ID combinations, and duplicate Komga IDs are rejected.
- Imports and exports share the existing job operation queue so scheduled notifications cannot interleave with an import. No new schema migration is required.

## Files changed

- Configuration/scheduler: `src/env.ts`, `src/instrumentation.ts`, `.env.example`.
- Jobs: `src/jobs/backup-db.ts`, `src/jobs/status.ts`.
- Services: `src/lib/services/follows-transfer.ts`, `import-skips.ts`, `metron.ts`, `library.ts`, `settings.ts`.
- Routes: `src/app/api/export/follows/route.ts`, `src/app/api/import/follows/route.ts`, `src/app/api/jobs/[name]/route.ts`.
- UI: `src/components/follows-transfer.tsx`, `src/app/settings/settings-client.tsx`.
- Design: `docs/design/preview.html`, `docs/design/screenshots/desktop-settings-m03.png`, `docs/design/screenshots/mobile-settings-m03.png`.
- Tests: `tests/backup-transfer.test.ts`, `tests/visual/routes.spec.ts`, `playwright.config.ts`, `tests/visual/snapshots/desktop-settings.png`, `tests/visual/snapshots/mobile-settings-follows.png`.
- Documentation: `README.md`, `AGENTS.md`, `PROJECT_AGENT_GUIDE.md`, this report.

## Design

Settings additions reuse the preview's sections, service rows, tools, and native file input. No new CSS, colors, or UI library. The preview shows representative backup status and connection data; the application displays real job state and retains its existing library selection and other job rows. Only the affected Settings baseline was updated; a mobile follows-control baseline was added.

## Verification

- `pnpm lint` and `pnpm typecheck`: passed.
- `pnpm test`: 49 passed across 15 files.
- `pnpm test:visual`: 25 passed.
- Backup tests open the copied SQLite file, run integrity_check, verify WAL content, same-day replacement, local date naming, seven-copy retention, unrelated-file preservation, and retention of a completed copy after failure.
- Transfer tests cover export → wipe → import, IDs/skips/dates, ownership, no Kapowarr requests, pending recovery, unskip after recovery, repeated imports, reactivation/history, malformed files, and download headers.
- Browser tests download a file, show a validation error, import a valid file, run a backup, and capture desktop/mobile Settings. Preview screenshots were rendered and inspected.

## Remaining verification

No new TODO(verify). SQLite's backup API was checked against its official documentation, linked in README. Production Docker mounts, a real overnight scheduled run, and an import against the user's live Metron account were not exercised. Existing integration TODOs remain unchanged.
