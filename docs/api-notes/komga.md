# Komga API notes

Source: [Komga API reference](https://komga.org/docs/openapi/komga-api/) and [series endpoints](https://komga.org/docs/openapi/series/), checked 2026-09-20.

- Authentication supports an API key in the `X-API-Key` request header.
- `GET /api/v1/libraries` lists the libraries accessible to the current API-key user. Gutter persists the chosen library ID locally; it does not alter Komga.
- `POST /api/v1/series/list` and `POST /api/v1/books/list` are the supported list endpoints. Their zero-based `page` and `size` pagination values are query parameters; the body is a search object. The older `GET /api/v1/series` and series-books endpoints are deprecated.
- The documented list-search body accepts `condition.libraryId` using the equality operator `{ operator: "is", value: "<library id>" }`; Gutter passes this condition to both series and book syncs when a library is selected.
- The response is a paged `content` array and is validated at the client boundary.
- Series artwork is fetched from `GET /api/v1/series/{seriesId}/thumbnail`; this URL requires the same authentication and is therefore proxied through Gutter rather than embedded directly.
- A listed book carries an optional `readProgress` object. `readProgress.completed` identifies a completed book and `readProgress.readDate` supplies its completion date; a non-completed progress object is in progress. The list/search API also supports read-status conditions (`UNREAD`, `READ`, `IN_PROGRESS`). Gutter obtains one cached complete book list and calculates all four dashboard stats from those documented fields, rather than inventing progress.

TODO(verify): capture the target instance's full search-condition schema from `/swagger-ui.html` before adding tag filtering for future recommendations. Read progress itself is verified against the official Books OpenAPI reference on 2026-09-21.

- `POST /api/v1/libraries/{libraryId}/scan` starts a scan and returns 202 (ADMIN role required). Gutter uses it only for the selected library after Kapowarr files become ready. [Komga scan API](https://komga.org/docs/openapi/library-scan/), checked 2026-09-26.
- Settings can request the same selected-library file scan explicitly; unlike Gutter's library sync, this asks Komga to inspect files. A `202` confirms only that Komga accepted the request, not that it finished scanning. Scheduled Gutter sync picks up completed results. Automatic scans coalesce pending Kapowarr completions and retry after the 30-minute debounce; a manual scan bypasses that debounce and clears any pending scan for its selected library.

## M06 reading dates

The documented `readProgress.completed` and `readProgress.readDate` fields above support dated completed reads. Suggestions and recap use completed books with a valid `readDate` only. An in-progress record has no verified recent activity timestamp, and an undated completion cannot be assigned a year or month. A series-finished year requires every cached book to be completed and dated. TODO(verify): whether the user's Komga version stores `readDate` for in-progress activity; until verified it is not counted as recent reading.

## ComicInfo.xml Web links

Komga does not document a series-level ComicVine identifier. Tagged books can contain a ComicInfo.xml Web link pointing to a ComicVine **issue**, not necessarily a volume. A read-only `GET /api/v1/books/{id}` against a tagged book on the configured Komga instance (2026-09-26) confirmed the link at `metadata.links[0].url`; the same path exists in `komga:books`. The matching service still scans each book's raw cached `metadata` recursively after checking `seriesId`, without assuming an array index or field path. A `4000-` issue URL is resolved to its parent volume through ComicVine; a `4050-` volume URL is already sufficient.
