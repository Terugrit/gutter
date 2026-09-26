# M06 implementation

Follow-up M06: reading suggestions, Discover explanation, and reading recap.

## Decisions

- Library suggests up to four cached Komga series with two **dated completed** books in the previous 60 days, excluding active follows and permanent dismissals. It never invents activity timestamps for in-progress reads; see the Komga API note.
- The recommendation cache retains its legacy `reason` text for old records and adds optional structured `why` provenance for the M06 line. This is a deliberate field-name deviation from the follow-up plan's suggested optional `reason` object, because old caches already store `reason` as a string and the ranking tests and callers rely on it. A cached record without `why` displays no M06 line. Writer provenance is used only when both cached sides have the same named writer; otherwise publisher or random provenance is used without a new network call.
- Recap uses only cached book completion dates interpreted in `TZ`. An undated or in-progress book does not count toward a specific year's recap. A series is considered finished in a year only if every cached book in that series is dated and completed. No migration, new job, or live API call was needed.
- Follow-up cover fix: daily page reads had rotated Recommended before artwork was checked, saving empty cover URLs. Now only the midnight/startup/manual refresh rotates after checking at most ten previews; it retains the previous covered set if all new candidates lack art. An all-coverless set is retried at startup when Metron is configured. Users with an already coverless cache can press Recommended → Refresh for immediate recovery.
- New UI was added to the design preview before implementation, using the existing strip, index, stats and token palette. The 12-month chart is made of CSS blocks, not a library. The recap and suggestions have the approved empty-state style. Preview sample data is intentionally illustrative; visual tests seed independent dated read fixtures.

## Files

- Services: `src/lib/services/follow-suggestions.ts`, `src/lib/services/recap.ts`, `src/lib/services/recommendations.ts`, `src/lib/recommendation-ranking.ts`.
- Routes/UI: `src/app/api/follow-suggestions/[id]/dismiss/route.ts`, `src/app/recap/`, `src/components/follow-suggestions.tsx`, `src/components/reading-recap.tsx`, Library, Discover and dashboard pages and CSS.
- Preview and docs: `docs/design/preview.html`, `docs/design/globals.css`, M06 preview screenshots, `docs/DESIGN.md`, `docs/api-notes/komga.md`, `AGENTS.md`, `PROJECT_AGENT_GUIDE.md`, `README.md`.
- Verification: `tests/m06-reading.test.ts`, ranking tests, `tests/visual/routes.spec.ts`, M06 app screenshots, `tests/visual/render-m06-preview.mjs`.

## Verification still needed

The Komga documentation verifies completed-read dates, but a live instance was not used to verify whether its in-progress `readDate` represents recent activity. Production Docker and real-account reading histories were not exercised. Existing API `TODO(verify)` items remain unchanged.
