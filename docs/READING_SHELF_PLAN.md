# Reading Shelf — feature plan

Status: implemented as M7. This document remains the feature and acceptance reference.

## Goal and scope

Give the single user a durable place to save **series** seen on the Dashboard and Discover pages, then choose later which volumes to send to Kapowarr. Saving a series is a bookmark: it must not follow the series, trigger a search, or send a notification. Sending to Kapowarr remains an explicit action.

The shelf is a separate page at `/shelf`. It resembles the Library's cover grid but has fewer controls. Every saved series has a visible cover in the grid, not a hover-only preview. The card shows its title, publisher, and **Year began** when Metron has a series start year. An unknown year is shown as `Year unknown`; do not infer a year from an issue cover or title. The shelf does not track individual issues in this milestone.

## User journey

1. A recommendation on the Dashboard or Discover has a `Save to shelf` action alongside its current Follow and Download volume actions. The two pages share one action component and state.
2. Saving succeeds once per Metron series ID and immediately changes the action to `On shelf`. Repeated clicks cannot create duplicates. A toast confirms `Saved to shelf`.
3. `Shelf` appears in the normal desktop and mobile navigation, between Library and Notifications. It is available from every route, and `/shelf` has the active navigation state.
4. The shelf displays all saved series newest first in the existing `.page` and `.grid` layout. Each card uses `Cover` and the `.cap` metadata treatment. A `Send to Kapowarr` action and a `Remove from shelf` action sit beneath the metadata.
5. `Send to Kapowarr` creates or reuses the Metron-backed follow, resolves the ComicVine volume through the existing service, and then calls the existing add-and-search flow. The UI must explain that sending also starts following the series. Sending does not remove the card from the shelf.
6. A successful send displays `Sent to Kapowarr` on the shelf. A failure leaves the series saved and offers a retry. If a match or ComicVine ID is missing, show the existing actionable matching error instead of claiming success.
7. Removing a card affects only the shelf. It must not unfollow a series, cancel a Kapowarr download, delete issue history, or dismiss the recommendation.

## Design and navigation

Update `docs/design/preview.html` and `docs/design/globals.css` first, then copy the approved CSS changes to `src/app/globals.css`. Extend `docs/DESIGN.md` with the shelf page and the six-item navigation. Reuse the preview's `page`, `title`, `tools`, `grid`, `item`, `cv`, `cap`, `lnk`, `sec`, toast, and empty-state patterns. Use only the existing colour tokens, Playfair Display, hairline rules, and square corners. No new UI library or separate visual style is needed.

The desktop TopBar and mobile TabBar both show: Dashboard, Library, Shelf, Notifications, Discover, Settings. The mobile pill is a single horizontally scrollable row at narrow phone widths, with the active link brought into view. Preserve usable touch targets, the existing attention badge, unread dot, active underline, and safe-area position. Add preview renders and application visual snapshots for desktop and mobile shelf, empty shelf, and the updated navigation.

On `/shelf`, use a plain title `Reading shelf`, a compact `Saved / Sent to Kapowarr` filter in the existing `.tools` style, and the grid. `Saved` shows items not yet sent; `Sent to Kapowarr` shows items with a saved Kapowarr volume. Default to all saved series, newest first. The extra filter should not obscure covers. If no items are saved, show one Playfair sentence and a link to Discover. A filter with no matches gets a simple sentence and a way to show all.

Each card shows the full cover at the Library grid size, then title, `Year began: <year>` or `Year unknown`, publisher, and available actions. The existing generated cover is the fallback when the cached URL is empty or unusable. Long titles and publisher names wrap; the actions remain readable on small screens. Display pending, success, and failure states with words, not colour alone.

## Data and service boundaries

Add a dedicated SQLite `reading_shelf` table through Drizzle and the idempotent runtime migration. Suggested columns: `id`, `metron_series_id` (unique), `title`, `publisher`, `year_began` (nullable), `cover_url` (nullable), and `saved_at`. Store a snapshot at save time so Discover rotation and cache expiry cannot erase a shelf card. Keep the shelf independent of `followed_series`; joining the two by Metron series ID supplies Follow and Kapowarr status without duplicating it.

The recommendation cache already has title, publisher, cover, and Metron ID. Its pool also has `yearBegan`, but the displayed recommendation schema currently drops it. Carry an optional validated `yearBegan` through both recommendation sets and new saves. Old cached recommendations remain valid. If the year is unavailable, store `null`; do not add a Metron request to a page render just to fill it.

Use `src/lib/services/reading-shelf.ts` for all shelf reads and writes. Pages read through that service only. The save endpoint receives a Metron ID and copies validated cached recommendation data on the server; it must not trust client-supplied title, cover URL, or publisher. It may read the existing cached pool when a recommendation rotates between render and click. It must not start a metadata refresh. The shelf page reads SQLite only and makes no Metron, ComicVine, or Kapowarr calls while rendering.

Keep the existing shared rate limiter and cache for any Metron or ComicVine work caused by an explicit send. Reuse the typed Kapowarr client through `sendSeriesToKapowarr()`. Do not add a new client, job, environment variable, or notification type.

## Routes and actions

| Route | Purpose |
|---|---|
| `GET /shelf` | Render saved series from `getReadingShelf()` with current follow and Kapowarr status. |
| `POST /api/shelf` | Validate a Metron ID, resolve its cached recommendation, and idempotently save the snapshot. Return the saved card and state. |
| `DELETE /api/shelf/[id]` | Remove one saved series by Metron ID; repeated deletes are harmless. |
| `POST /api/shelf/[id]/kapowarr` | Require an existing shelf entry, create or reuse its follow, then use the established add-and-search service. Return the existing volume as success without starting another search. |

The dashboard and Discover action component needs the initial saved ID set so its `Save to shelf` / `On shelf` state is correct on first render. Use `router.refresh()` or an equivalent shared state update after saving or removing. A save must stay visible on the shelf even if Discover refreshes or the recommendation later disappears. A sent series may disappear from recommendations under the existing followed-series exclusion, but its shelf card remains.

## Implementation sequence

1. Extend the approved preview, design document, screenshots, and navigation behaviour for six destinations and the shelf states.
2. Add the Drizzle table and equivalent idempotent migration for existing databases. Keep schema and migration definitions in step.
3. Extend the recommendation type and cache parsing with optional `yearBegan`; preserve compatibility with old cache entries.
4. Implement the shelf service and validated save, remove, and send routes. Make the save/delete/send operations idempotent and separate their side effects.
5. Reuse the shared recommendation actions on Dashboard and Discover for the new save control. Add `/shelf` and its small client component for filtering and actions.
6. Update TopBar and TabBar, documentation, and visual fixtures. Since routes, schema, and structure change, update `AGENTS.md` in the implementation change.
7. Run `pnpm lint && pnpm typecheck && pnpm test`, then the relevant Playwright visual checks. Inspect desktop and mobile renders against the revised preview.

## Acceptance criteria

- Save from either recommendation surface; the same series appears once on the shelf after refresh and restart.
- Saving alone produces no follow, download, notification, or external API request.
- Every shelf card displays its cover or the standard generated fallback, title, publisher, and a real series start year or `Year unknown`.
- Shelf remains reachable from the desktop and mobile nav on every route, including at phone widths; active state, focus, badges, and touch targets remain usable.
- Discover rotation, dismissal, and cache expiry do not remove saved cards.
- Sending from the shelf requires a click, follows the series as disclosed, uses the existing Kapowarr service, and does not trigger a second search on repeat.
- A failed send can be retried and leaves the saved card intact. Removal never affects follows or Kapowarr.
- The shelf page has loading and empty states in the approved visual language; keyboard and screen-reader labels cover all actions.
- Lint, typecheck, unit tests, and updated visual tests pass.

## Deferred ideas

Custom ordering, notes, ratings, individual-issue shelf entries, and automatic download rules are outside this milestone. The first version includes only the Saved / Sent filter and newest-first order.

## Implementation note

The phone navigation uses a swipeable single row, as requested after the original plan. The active link is brought into view after route and font changes. The shelf uses the existing generated cover when artwork is missing or fails to load. Kapowarr sends still follow the series, and the shelf explains that before the action. The original design preview has been extended with the new page, controls, and navigation.
