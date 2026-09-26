# ComicVine API notes

- The fallback uses `GET https://comicvine.gamespot.com/api/search/` with `api_key`, `format=json`, `resources=volume`, and `query`.
- The response envelope has `status_code`, `error`, and `results`; only volume results are accepted. The selected result supplies `id` as the ComicVine volume ID.
- Calls are made only after a selected Metron record has no `cv_id`, then cached and sent through the shared metadata limiter.

## Issue links in tagged Komga books

- Kapowarr/ComicTagger put ComicVine issue URLs (`/4000-<issue id>/`) in ComicInfo.xml's Web link; a volume URL uses `/4050-<volume id>/`. Source: [Kapowarr's upstream embedded-ID proposal](https://github.com/llithium/Kapowarr/pull/4) and the ComicVine API's issue resource convention (user-provided integration specification). A volume URL can be used directly; an issue URL must be resolved to its parent volume before searching Metron by `cv_id`.
- `GET https://comicvine.gamespot.com/api/issue/4000-<issue id>/?api_key=...&format=json&field_list=volume` returns `{ status_code, error, results: { id, volume: { id } | null } | null }`. A `status_code` other than `1` or a null volume is not a match. Calls use the existing shared metadata limiter and cache; no browser/page-load calls.
- TODO(verify): confirm the response shape against a live ComicVine issue when credentials are available. Komga's tagged-book response was checked; see `komga.md`.
