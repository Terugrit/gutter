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
