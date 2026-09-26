# Kapowarr API notes

- Kapowarr's API prefix is `/api`; authentication is the `api_key` query parameter. Responses are `{ error, result }`.
- `POST /api/auth/check` verifies the connection. `GET /api/volumes` returns existing volumes, including `id` and `comicvine_id`; matching an existing `comicvine_id` is a successful add.
- `POST /api/volumes` requires `comicvine_id` and `root_folder_id`. Gutter gets the first configured root folder from `GET /api/rootfolder`, creates with `auto_search: false`, then starts the user-requested search with `POST /api/system/tasks` body `{ cmd: "auto_search", volume_id }`.
- Verified against Kapowarr's public source (v1.3.2-era main branch). No request is made until the user presses Send to Kapowarr.
- Discover and dashboard Download volume actions first create the Metron-backed follow, then use its ComicVine volume ID with the same add-and-search service. Metron's `cv_id` is used directly when present; ComicVine search is the fallback.

## Status reads (verified 2026-09-26)

- `GET /api/volumes/{id}` returns `issue_count`, `issues_downloaded`, and an `issues` array. Each issue has `files` (array of matched files). `issues_downloaded` counts issues with files, rather than physical file count. [Upstream API](https://github.com/Casvt/Kapowarr/blob/main/frontend/api.py), [volume implementation](https://github.com/Casvt/Kapowarr/blob/main/backend/implementations/volumes.py).
- `GET /api/activity/queue` returns all queue entries. The queue is filtered by `volume_id`; its entries are in progress or waiting. [Upstream API](https://github.com/Casvt/Kapowarr/blob/main/frontend/api.py), [queue implementation](https://github.com/Casvt/Kapowarr/blob/main/backend/features/download_queue.py).
- Gutter uses `issues_downloaded` / `issue_count` as its ready/total display. `files-ready` means at least one issue has a file and no queue entry remains; it does not claim the whole volume is complete. The selected-library Komga scan follows only a transition into that state.

TODO(verify): compare these response shapes with the user's installed Kapowarr version. The implementation is validated against upstream source and mocked responses, but no live instance was available.
