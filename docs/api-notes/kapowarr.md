# Kapowarr API notes

- Kapowarr's API prefix is `/api`; authentication is the `api_key` query parameter. Responses are `{ error, result }`.
- `POST /api/auth/check` verifies the connection. `GET /api/volumes` returns existing volumes, including `id` and `comicvine_id`; matching an existing `comicvine_id` is a successful add.
- `POST /api/volumes` requires `comicvine_id` and `root_folder_id`. Gutter gets the first configured root folder from `GET /api/rootfolder`, creates with `auto_search: false`, then starts the user-requested search with `POST /api/system/tasks` body `{ cmd: "auto_search", volume_id }`.
- Verified against Kapowarr's public source (v1.3.2-era main branch). No request is made until the user presses Send to Kapowarr.
- Discover and dashboard Download volume actions first create the Metron-backed follow, then use its ComicVine volume ID with the same add-and-search service. Metron's `cv_id` is used directly when present; ComicVine search is the fallback.
