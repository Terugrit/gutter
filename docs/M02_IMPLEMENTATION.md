# M02 implementation

Completed 2026-09-25: issue skipping and collection progress.

## Behavior and decisions

- An issue can be skipped or restored from its series detail. The Skipped filter keeps excluded issues accessible. Repeating a skip preserves the original timestamp.
- Skips are excluded through the shared eligibility helper from missing issues, release alerts, weekly digests, and progress. Existing notification history and dedupe keys remain intact. The coming-up strip belongs to M04 and will use this helper when implemented.
- Progress counts active, ordinary numbered issues, excluding annuals, variants, and skips. The denominator is released issues through today in the configured timezone. Only owned released issues count in the numerator; future and undated issues can count in total but cannot overfill the bar.
- A collection with no eligible released issues displays “No released issues yet.” Otherwise, owning every released issue gives Up to date; verified Completed or Cancelled Metron status gives Complete. Unknown status never gives Complete.
- Metron detail `name` is normalized to the existing client `series` field. Status is retrieved through the existing queue/cache during imports and release refresh, and stored locally. Rendering the series page never requests Metron.
- Issue upserts retain skip timestamps by unique Metron issue ID. Rematching away and back reactivates the same issue and retains its choice; a different issue does not inherit it.
- The single Drizzle migration records two nullable columns and a current schema snapshot. Existing runtime/container startup migration remains idempotent and applies the equivalent column additions. No deployment configuration changed.

## Files changed

- Database: `src/db/schema.ts`, `src/db/migrate-schema.ts`, `drizzle/0000_m02_issue_controls.sql`, `drizzle/meta/0000_snapshot.json`, `drizzle/meta/_journal.json`.
- Client: `src/clients/metron/schemas.ts`, `src/clients/metron/client.ts`, `docs/api-notes/metron.md`.
- Services: `src/lib/services/issue-controls.ts`, `series-progress.ts`, `series.ts`, `missing.ts`, `metron.ts`.
- API: `src/app/api/issues/[id]/skip/route.ts`.
- Jobs: `src/jobs/refresh-releases.ts`, `src/jobs/weekly-digest.ts`.
- UI: `src/app/series/[id]/series-client.tsx`, `src/components/series-progress.tsx`, `src/app/globals.css`.
- Design: `docs/design/preview.html`, `docs/design/globals.css`, four new series screenshots in `docs/design/screenshots/`.
- Verification: `tests/issue-controls.test.ts`, `tests/database.test.ts`, `tests/visual/routes.spec.ts`, five new series snapshots in `tests/visual/snapshots/`.
- Guides: `AGENTS.md`, `PROJECT_AGENT_GUIDE.md`, this report.

## Design

The preview was extended before the application UI, reusing filters, tools, index rows, metadata, and the existing token palette. The progress indicator is a two-pixel accent rule with text for its state. The preview also exposes sample-state switches solely for reviewing all three progress states; these switches are not application controls. Existing cover samples differ between preview and test fixtures. No existing application snapshot was updated for M02.

## Verification

- `pnpm lint`: passed.
- `pnpm typecheck`: passed.
- `pnpm test`: 44 passed across 14 files.
- `pnpm test:visual`: 23 passed, including all three progress states and a mobile skip → reload → filter → unskip round trip.
- Integration coverage includes validation, missing-list restoration, release/digest exclusion, dedupe preservation, refresh/rematch persistence, unknown status, local midnight, and repeat migrations. Legacy database tests check both new columns.
- Preview renders were inspected at desktop and mobile sizes.

## Remaining verification

No new M02 TODO(verify). Metron status values were verified against its official serializer and model source, with links in the API note; a production account response was not requested. Existing TODO(verify) about Komga's metadata identifier field remains. Later milestone features remain outside M02.
