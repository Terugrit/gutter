# Changelog

## 0.1.3

- Add web app manifest for proper iOS/Android home screen icon support.
- Link manifest in app metadata for improved PWA compatibility.

## 0.1.2

- Add Reading Shelf: save Dashboard and Discover recommendations without following or downloading them, then send a saved series to Kapowarr when ready.
- Add Shelf to desktop and mobile navigation, with saved/sent filters, cover, publisher and start-year details, generated-cover fallbacks, and empty and loading states.
- Add a 30–45 day Coming Soon rotation with publisher/genre exclusions, a labelled wildcard pick, manual series lookup, and issue- or series-level release watches.
- Add Released for you at the top of Shelf. Watched issues enter the queue and normal notification flow on release, and leave after Kapowarr reports completed files.
- Add scheduled Coming Soon refresh, release-date checking, and interest tuning, plus Settings controls for the first two jobs.
- Show upcoming followed-series releases together in one horizontal dashboard strip under the title `Coming up: Followed Series`.
- Add individual notification deletion and Clear all. Deleted notifications are hidden while retained for delivery deduplication.
- Add automatic database upgrades for shelf, watch, Coming Soon, release-queue, and notification-deletion data.
- Extend Metron caching and recommendation details with series start years and upcoming-release date-range support.
- Refresh the dashboard, shelf, navigation, notification, recap, Discover, and app-icon visual references.

## 0.1.1

- Replace the obsolete Home Assistant watchdog setting with a native container health check.
- Remove app startup and boot values that duplicate Home Assistant defaults.
- Add Gutter metadata to locally built container images.
- Isolate the build-time database so parallel Next.js workers cannot lock it.

## 0.1.0

- Initial Home Assistant app package.
- Expose the existing Gutter environment settings in the app Configuration UI.
- Persist the SQLite database and backups in the Home Assistant app data directory.
