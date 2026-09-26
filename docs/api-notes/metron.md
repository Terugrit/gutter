# Metron API notes

## M02 series status (verified 2026-09-25)

The official [read serializer](https://github.com/Metron-Project/metron/blob/master/api/v1_0/serializers/series.py)
returns `status` using `get_status_display`. The [Series model](https://github.com/Metron-Project/metron/blob/master/comicsdb/models/series.py)
defines Cancelled, Completed, Hiatus, and Ongoing. Gutter stores the lower-case
name; completed and cancelled count as ended. Unknown or absent status stays
null and can never produce Complete. The README uses "continuing", but the
read serializer/model are the source of truth for the response.

Status is a detail-only field: fetch `GET /series/{id}/` through the existing
queue/cache during matching and release refresh. Detail uses `name`; list
results use `series`. The client normalizes the detail title into `series`.
Pages read the stored status and never request Metron metadata.

Issue imports upsert by unique `metron_issue_id`, preserving columns omitted
from the update. Rematches deactivate old rows and reactivate matching IDs;
`skipped_at` is therefore retained without copying it to unrelated issues.

Source: [Metron API README](https://github.com/Metron-Project/metron/blob/master/api/README.md), verified 2026-09-20.

- Base URL is `https://metron.cloud/api/`. The API requires authentication; Gutter uses HTTP Basic auth from `METRON_USER` and `METRON_PASSWORD`.
- Series search and listing are `GET /series/` with `name`, `publisher_name`, `year_began`, and `language` filters. A broad `GET /series/?language=en&page=N` lists English series for sampled Discover pool pages. The response is paginated: `{ count, next, previous, results }`. `count` is the filtered total and the first full page's result length gives the effective page size; later pages are sampled without replacement. Series results include `id`, `series`, `year_began`, `issue_count`, `publisher.name`, and `cv_id`. The existing Discover pool retains `year_began` and `issue_count` for local recommendation scoring and zero-issue filtering; older pool entries fall back to the year in their title.
- A series issue list is `GET /series/{id}/issue_list/`. Issue-list responses are paginated and list records include `id`, `number`, `issue`, `store_date`, `image`, and `modified`; issue details additionally include `desc` and credits.
- English is requested at query time with `language=en`; Gutter also rejects non-English series returned by a response defensively.
- The API supports `cv_id` filtering. A Komga metadata Comic Vine ID can therefore be used to find the matching Metron series before text scoring.
- Creator lookup uses `GET /creator/?name=...`; the documented `creator_id` filter on `GET /series/` supplies writer-based Discover candidates. Issue credits are read from `GET /issue/{id}/`, because the compact issue-list response does not promise credits.
- Metron documents conditional responses for series and series issue-list endpoints. M03 keeps its own SQLite cache with a short TTL and routes all calls through the shared queue; conditional request validators can be added when the cache is refreshed in M4.
- Metron's API best-practices guide documents `X-RateLimit-Burst-Remaining` / `-Reset` and `X-RateLimit-Sustained-Remaining` / `-Reset` response headers. Discover pool refills use the shared queue, observe those headers, and stop when quota is exhausted instead of repeatedly retrying.

TODO(verify): Komga's public API documentation does not specify a stable field for Comic Vine or Metron identifiers in a series metadata payload. The matcher accepts the common `comicvineId` / `comicVineId` / `cvId` variants when present and otherwise uses the documented Metron text filters.
