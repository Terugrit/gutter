# Coming Soon and release shelf — implementation reference

Status: implemented as M8 from the user-provided `gutter-coming-soon-reading-shelf-spec.md`.

## Integration decision

M7 already defines `reading_shelf` and `/shelf` as a durable saved-series bookmark workflow. M8 preserves that user data and adds the plan's released-issue staging workflow as `release_shelf`, displayed above saved series on the same `/shelf` route. API routes retain the requested `/api/reading-shelf` name for the release queue.

## Behavior

- `refresh-upcoming-releases` reads Metron's documented top-level issue date range for days 30–45, enriches candidates from cached series detail, honors English, negative filters, and dismissed series, and auto-creates new issue watches for series-scoped watches.
- Dashboard selection weights publisher and genre signals from cached Komga and followed-series data. One available outside-interest candidate is labeled as the wildcard.
- Following creates or reuses a normal Metron-backed follow so the established issue cache and notification pipeline remain authoritative. It never sends to Kapowarr.
- `check-release-dates` stages due watches once and reuses the existing deduplicated release notification. The Kapowarr poll advances pending/downloading rows and soft-removes them on a files-ready transition, recording a downloaded outcome.
- Manual search is an explicit Metron call. Dashboard and Shelf page loads read SQLite/cache only.
- Metron has no documented solicit-confirmation response field; imported candidates default to `solicited`. ComicVine solicitation import remains `TODO(verify)` until its date-range response is documented against the installed integration. ComicVine IDs already carried by Metron are retained for follow/Kapowarr resolution.

## Schedules

- Coming Soon refresh: daily 05:30 local time.
- Release watch check: daily 06:00 local time.
- Interest tuning: Sunday 06:30 local time.
- Release shelf download sync: existing `KAPOWARR_CHECK_CRON` poll.

## Kapowarr link note

The stored link uses the configured Kapowarr base URL plus `/volumes/<id>`, matching current upstream navigation. `TODO(verify)`: confirm this deep-link path against the user's installed Kapowarr version and reverse-proxy configuration; status polling does not depend on the link.
