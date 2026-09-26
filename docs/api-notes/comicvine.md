# ComicVine API notes

- The fallback uses `GET https://comicvine.gamespot.com/api/search/` with `api_key`, `format=json`, `resources=volume`, and `query`.
- The response envelope has `status_code`, `error`, and `results`; only volume results are accepted. The selected result supplies `id` as the ComicVine volume ID.
- Calls are made only after a selected Metron record has no `cv_id`, then cached and sent through the shared metadata limiter.
