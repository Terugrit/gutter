# Home Assistant App: Gutter

Gutter tracks comic releases for a Komga library, sends ntfy notifications, and can send missing issues to Kapowarr.

## Configuration

Configure service URLs and credentials on the app's **Configuration** tab before starting Gutter. URLs must be reachable from inside the app container. `localhost` points to Gutter itself, not to another Home Assistant app or machine.

Set **Gutter public URL** to the URL your phone uses to reach Gutter, including the port configured under **Network** (for example, `http://homeassistant.local:3000`). Notification links use this value.

The optional notification action secret must contain at least 32 characters. Schedule fields use standard five-part cron expressions. The time zone must be an IANA name such as `Europe/Amsterdam`.

## First run

1. Save the configuration and start the app.
2. Select **Open Web UI**.
3. Open Gutter's Settings page, test each configured service, and select a Komga library.
4. Open Library and follow the series you want to track.

The SQLite database and default daily backups are stored in `/data`, which Home Assistant preserves across app upgrades and includes in app backups.

## Network access

Gutter uses a regular exposed port rather than Home Assistant Ingress so its Next.js assets and notification links retain stable URLs. The default host port is `3000`; change it in the app's Network configuration if that port is already in use.
