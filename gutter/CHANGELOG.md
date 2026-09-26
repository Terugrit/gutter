# Changelog

## 0.1.1

- Replace the obsolete Home Assistant watchdog setting with a native container health check.
- Remove app startup and boot values that duplicate Home Assistant defaults.
- Add Gutter metadata to locally built container images.
- Isolate the build-time database so parallel Next.js workers cannot lock it.

## 0.1.0

- Initial Home Assistant app package.
- Expose the existing Gutter environment settings in the app Configuration UI.
- Persist the SQLite database and backups in the Home Assistant app data directory.
