# Gutter

Self-hosted comic release tracking for a Komga library.

## First run

1. Copy `.env.example` to `.env`, then set `KOMGA_URL`, `KOMGA_API_KEY`, and `APP_BASE_URL`. `KOMGA_URL` must be reachable from inside the Gutter container (for example `http://komga:25600` on a shared Docker network).
2. Run `docker compose up -d --build`.
3. Open `http://localhost:3000`, follow the first-run links to Settings, select your Komga library, then open Library to follow series. Check `http://localhost:3000/api/health` for the health status.

The SQLite database is stored in Docker's `gutter-data` volume at `/data/app.db`; it survives `docker compose down` and later `up` runs. To update, run `docker compose pull && docker compose up -d --build`.

## Install on a phone

Gutter has a web app manifest and temporary placeholder icons. Browsers offer a full install on HTTPS or localhost. On a plain HTTP LAN address, Android may only add a shortcut. Use an HTTPS reverse proxy for a full install. Gutter does not cache data offline.

Job failures send a high-priority ntfy warning after two consecutive failures. A successful run sends a recovery message. This watches scheduled and manual runs while the app is running; it cannot detect when the whole process is down.

## Discover recommendations

**Recommended for you** scores the existing local Discover pool against 3–5 Komga and followed series, then draws up to 10 weighted picks from the best 50. It favors shared publisher and similar publication years; genre, creator, character, and series type overlaps also count when those fields are already cached on both sides. Each row names the series and overlap behind its recommendation. Opening Discover makes no Metron request for recommendations. **Something different** keeps its separate pool refresh and cover checks.

Recommendations stay fixed for a local calendar day (`TZ`). The Recommended refresh button shuffles them from local data, then checks issue art for up to 10 selected candidates through Metron's existing rate-limited cache. A midnight background job prepares the next day's covered picks; opening Discover itself makes no Metron request. Series in Komga, followed series, current Something different picks, and recommendations shown during the exclusion window are omitted. Show dates are saved in SQLite's `kv_cache` as `last_shown_at` entries.

The optional `RECOMMENDATION_SEED_COUNT` setting defaults to `5` (allowed: `3`–`5`). `RECOMMENDATION_EXCLUSION_DAYS` defaults to `14` (allowed: `1`–`90`). Keep five seeds if you want the full 10 rows: each seed can explain at most two picks. A thin pool or strict exclusions can produce fewer than 10 rows until the existing pool refresh adds suitable candidates.

Discover and dashboard cards have **Follow** and **Download volume** actions. Download volume follows the series, uses its Metron `cv_id` when available, adds the volume to Kapowarr, and starts Kapowarr's search. ComicVine lookup is used only when Metron has no `cv_id`.

## Windows development

Gutter pins pnpm 9.15.4 in `package.json` and downloads Node 22.23.2 through `.npmrc`. Your globally installed Node version may differ; `pnpm node --version` shows the version Gutter uses. Use the Corepack command shim below to avoid PowerShell script-policy and competing pnpm installations.

```powershell
cd C:\Users\alexa\Documents\Comics\Gutter
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
& 'C:\Program Files\nodejs\pnpm.cmd' install
& 'C:\Program Files\nodejs\pnpm.cmd' dev
```

Open http://localhost:3000. Development data lives in `./data/app.db` without extra setup. The app upgrades that database when it opens it; `pnpm db:migrate` remains available for an explicit upgrade. `GUTTER_DB_PATH` can override that path; production still defaults to `/data/app.db`.

Keep one development terminal open. Press Ctrl+C there to stop Gutter before restarting. `pnpm dev` now fails if port 3000 is occupied instead of silently switching ports. Development uses `.next-dev`, separate from production's `.next`. The visual suite runs on port 3001 with `.next-visual` and an isolated `data/visual-test.db`; it can run beside development. Never delete a build directory while its server is running.

Run `pnpm lint`, `pnpm typecheck`, and `pnpm test` to verify the project. Only proceed after installation succeeds.

On Windows, standalone production packaging may fail with `EPERM ... symlink` if the account cannot create symbolic links. Local `pnpm dev` does not require that permission. The Dockerfile packages the standalone app inside Linux; Docker packaging has not yet been verified on this machine.

Settings shows the last successful job runs, failures, and cache freshness. Use **Run now** beside Library sync or Release refresh to retry a job after fixing a connection. Visual baselines for the current app live in 	ests/visual/snapshots/; the approved design references remain in docs/design/screenshots/.


## Database backups and follows transfer

Gutter creates an online SQLite backup nightly at 03:30 in `TZ`. Set
`BACKUP_CRON` to change that schedule. `BACKUP_DIR` defaults to `backups/`
next to the database (`/data/backups` in Docker). Settings → Data and jobs →
Database backup → Run now runs the same tracked job. Failed backups use the
existing job-failure alerts.

Files are named `gutter-YYYY-MM-DD.db`. A successful repeat on the same local
day replaces that day's copy; the newest seven dated copies are retained.
A failed copy never replaces a completed backup. Other filenames are untouched.
The job uses the driver's online backup API, not a filesystem copy of the live
WAL database: [better-sqlite3 backup documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#backupdestination-options---promise).

**The default backup directory is in the same volume as the database.** For
protection against disk or volume loss, mount `BACKUP_DIR` on another disk or
path. For example set `BACKUP_DIR=/backups` and add a bind mount
`/mnt/other-disk/gutter:/backups` to the service's volumes. The app needs write
permission there. To restore a full backup, stop Gutter, preserve the current
DB and its `-wal`/`-shm` files elsewhere, place the chosen backup at the configured
DB path without old sidecar files, and start Gutter again.

Settings → Follows has Download follows and Import follows. Version 1 JSON
contains series names, service IDs, match/monitor choices, original follow dates,
active flags, and skipped Metron issue IDs. It contains no credentials or
notification history. Import validates the entire file before changing data,
adds or reactivates included follows, and keeps other follows and existing
notification history. Even entries exported as inactive are reactivated by import.
Skipped choices are merged; importing does not clear existing skips. Discover
sentinel IDs are retained. No Kapowarr download is triggered.

Matched imports refresh their cached issues and reapply Komga ownership. If
Metron is unavailable, the result reports pending follows and retains their
skip choices locally. Configure Metron and run Release refresh to retry, or
import the same file again. Imports are limited to 5 MB. A follows export is
portable configuration, not a replacement for the full database backup.
