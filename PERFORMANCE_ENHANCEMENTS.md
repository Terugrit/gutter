# Performance Enhancements for Gutter

This document captures the highest-impact performance improvements for the current codebase.

## Highest priority

### 1. Eliminate N+1 queries in `cacheIssues()`

File: `src/lib/services/metron.ts`

`cacheIssues()` iterates through each Metron issue and does per-item database checks, optional detail lookups, and insert/update work. For a series with many issues, this creates a large number of SQLite queries and slows refresh jobs dramatically.

Recommended change:

- Fetch all existing issues for the followed series once.
- Build a `Map` keyed by `metronIssueId`.
- Compare the incoming issue list to the map.
- Apply insert/update batches in a single transaction.

Example pattern:

```ts
const existingIssues = await db
  .select()
  .from(issues)
  .where(eq(issues.followedSeriesId, followedSeriesId));

const existingByMetronId = new Map(
  existingIssues.map((issue) => [issue.metronIssueId, issue]),
);

for (const listedIssue of result) {
  const existing = existingByMetronId.get(listedIssue.id);
  // Build updates/inserts without re-querying the DB for each issue.
}
```

This is likely the most important improvement in the release-refresh path.

### 2. Replace sequential refreshes with bounded concurrency

File: `src/lib/services/metron.ts`

`refreshFollowedIssues()` currently does a loop and awaits each series refresh serially:

```ts
for (const follow of follows) {
  if (follow.metronSeriesId) {
    await cacheIssues(follow.id, follow.metronSeriesId, true);
  }
}
```

This makes runtime proportional to the number of followed series and can grow very slowly as the library grows. Use a small concurrency window instead of fully serial work.

Example:

```ts
const queue = follows.filter((follow) => follow.metronSeriesId);

for (let index = 0; index < queue.length; index += 2) {
  await Promise.all(
    queue.slice(index, index + 2).map((follow) =>
      cacheIssues(follow.id, follow.metronSeriesId!, true),
    ),
  );
}
```

This keeps throughput high while respecting Metron rate limits.

### 3. Put Metron API calls behind the shared rate-limit queue

File: `src/lib/services/metron.ts`

`cacheIssues()` calls `metron.listIssues()` directly instead of going through the shared queue that is already designed for rate-limited metadata calls. This can trigger rate-limit throttling or request bursts during refresh jobs.

Use:

```ts
result = await enqueueRateLimited(() => metron.listIssues(metronSeriesId));
```

The same review should apply to related fetches like `getMetronSeries()` and `getMetronIssue()` when they are being called from high-frequency paths.

### 4. Optimize `applyKomgaOwnership()`

File: `src/lib/services/library.ts`

`applyKomgaOwnership()` loops through all followed series and inside that loop iterates through a potentially large array of books, then performs individual `UPDATE` calls for each issue number. This is effectively quadratic in practice.

Recommended fix:

- Build a `Map<string, Set<string>>` of issue numbers by series.
- Update ownership in one transaction.
- Collapse repeated writes into fewer bulk operations.

Current pattern:

```ts
for (const number of numbers) {
  await db.update(issues).set({ owned: true }).where(
    and(eq(issues.followedSeriesId, follow.id), eq(issues.number, number)),
  );
}
```

This should be replaced with a batched approach that operates on grouped data instead of one row at a time.

## Database improvements

### 5. Add indexes for the hot paths

File: `src/db/schema.ts`

The most common query paths are filtered by followed-series joins, issue state, and notifications. Add indexes for those access patterns.

Suggested indexes:

```sql
CREATE INDEX IF NOT EXISTS issues_followed_series_active_idx
ON issues (followed_series_id, active);

CREATE INDEX IF NOT EXISTS issues_store_date_idx
ON issues (store_date);

CREATE INDEX IF NOT EXISTS issues_owned_store_date_idx
ON issues (owned, store_date);

CREATE INDEX IF NOT EXISTS notifications_issue_id_idx
ON notifications (issue_id);

CREATE INDEX IF NOT EXISTS notifications_sent_at_idx
ON notifications (sent_at);

CREATE INDEX IF NOT EXISTS notifications_read_at_idx
ON notifications (read_at);

CREATE INDEX IF NOT EXISTS followed_series_active_match_idx
ON followed_series (active, match_status);
```

The most important early candidate is `(followed_series_id, active)`, because many queries join issues to followed series and then filter on activity.

### 6. Avoid loading all notifications for simple count/detail reads

File: `src/lib/services/notifications.ts`

`getNotification(id)` uses `getNotifications()` and then searches in memory. `getUnreadNotificationCount()` also loads every notification before counting them.

This scales poorly as notification history grows.

Recommended changes:

- Use a database query that filters by ID for `getNotification(id)`.
- Use `SELECT COUNT(*)` with a `readAt IS NULL` condition for unread counts.
- Use `MIN()`/`ORDER BY` for `oldestNotificationDate()` rather than loading the full list.

Example:

```ts
export async function getUnreadNotificationCount() {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(isNull(notifications.readAt));

  return result[0]?.count ?? 0;
}
```

### 7. Use explicit column projection for large joins

Files: `src/lib/services/series.ts`, `src/lib/services/notifications.ts`, and others

Several functions use `db.select().from(...)` with entire rows even when only a few fields are needed. This loads more data than necessary and increases memory and query cost.

Prefer projecting only fields that the UI actually uses.

```ts
await db
  .select({
    id: followedSeries.id,
    title: followedSeries.title,
    publisher: followedSeries.publisher,
  })
  .from(followedSeries)
  .where(...);
```

This is especially valuable for issue metadata, credits, and description fields that can be large.

## Algorithmic improvements

### 8. Reduce the quadratic cost in `readingStatsFromBooks()`

File: `src/lib/services/reading.ts`

The function currently does repeated nested filtering in JavaScript.

Current pattern:

```ts
const allSeries = new Set(books.map((book) => book.seriesId));
const seriesCompleted = [...allSeries].filter((seriesId) =>
  books.filter((book) => book.seriesId === seriesId)
    .every((book) => book.readProgress?.completed),
).length;
```

This is O(n²) in the number of books. Replace it with a single pass using a map.

Example:

```ts
const seriesState = new Map<string, { total: number; completed: number }>();

for (const book of books) {
  const state = seriesState.get(book.seriesId) ?? { total: 0, completed: 0 };
  state.total += 1;
  if (book.readProgress?.completed) state.completed += 1;
  seriesState.set(book.seriesId, state);
}

const seriesCompleted = [...seriesState.values()].filter(
  (state) => state.total === state.completed,
).length;
```

### 9. Precompute lookup maps for discovery matching

File: `src/lib/services/library.ts`

`reconcileDiscoverFollows()` loops through discovery entries and scans the full series list repeatedly. This is fine for small sets, but it becomes inefficient as the library grows.

Use lookup maps instead:

```ts
const libraryByKey = new Map(
  librarySeries.map((item) => [
    `${normalized(item.t)}:${normalized(item.pub)}`,
    item,
  ]),
);
```

This reduces repeated linear scans to near-constant lookups.

### 10. Remove dead variables and unnecessary filtering

File: `src/lib/services/upcoming.ts`

There is an unused `recent` variable:

```ts
const recent = now.getTime() - 14 * 24 * 60 * 60 * 1000;
```

It does not appear to be used downstream. Removing it saves a few CPU cycles and makes the code easier to follow.

Also, a portion of the filtering is done in JS after the SQL query. That can be reduced or simplified when the date logic is moved into a more SQL-friendly form.

## Komga sync improvements

### 11. Avoid reprocessing all books/series on every sync

File: `src/jobs/sync-komga.ts`

The sync job currently lists all series and all books every time. This is simple but expensive as the library grows.

Potential improvements:

- Query only incremental changes if the Komga API supports them.
- Store only the normalized fields needed by the app instead of complete raw objects.
- Store a smaller ownership model instead of re-parsing a full list of books for each ownership calculation.

This is a strong candidate for future optimization because the library data is likely the heaviest payload in the system.

### 12. Reduce repeated JSON parsing of cached data

Several services read `kvCache` and parse the same JSON blobs repeatedly. This is not always expensive on small datasets, but it adds up when the app is serving multiple pages and multiple services call into the same cached payload.

Recommended improvements:

- Add a shared cache helper.
- Parse once and reuse results within a request.
- Keep cache rows small and normalized.

## Release notification improvements

### 13. Avoid insert-then-select for notification deduplication

File: `src/jobs/refresh-releases.ts`

`sendRelease()` does an insert with `onConflictDoNothing()` and then does a follow-up `SELECT` to fetch the inserted row. This works, but it is an extra round trip.

Improvement ideas:

- Use `RETURNING` if SQLite dialect support is available.
- Select only `id` and `sentAt`.
- Ensure the dedupe key has a proper unique index in the schema.

This won’t dramatically affect volume for a small number of releases, but it is a good optimization in the write path.

## Recommended implementation order

1. Add database indexes and verify with `EXPLAIN QUERY PLAN`.
2. Fix the N+1 issue in `cacheIssues()`.
3. Add shared rate-limit enforcement to Metron fetches.
4. Optimize `applyKomgaOwnership()` with batched updates and maps.
5. Replace full-list notification queries with targeted queries.
6. Reduce the O(n²) cost in reading stats.
7. Add bounded concurrency to refresh jobs.
8. Rework Komga sync to process only changed data when possible.

In practical terms, the first four items should produce the biggest improvements with the least risk.

## Summary

The codebase generally does the right things in terms of structure and caching, but the biggest opportunities are in:

- database query count,
- repeated JSON parsing,
- sequential refresh loops,
- and per-item writes for large lists.

Tackling those areas first will pay off more than micro-optimizations in view code or small helper functions.
