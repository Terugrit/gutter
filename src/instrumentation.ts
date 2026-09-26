export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.GUTTER_VISUAL_TEST !== "1") {
    const { schedule } = await import("node-cron");
    const { env } = await import("@/env");
    const { syncKomga } = await import("@/jobs/sync-komga");
    const { refreshReleases } = await import("@/jobs/refresh-releases");
    const { backupDb } = await import("@/jobs/backup-db");
    const { weeklyDigest } = await import("@/jobs/weekly-digest");
    const { refreshDiscover, initializeDiscover } = await import("@/lib/services/recommendations");

    void syncKomga().then(() => initializeDiscover()).catch(() => undefined);

    const options = { timezone: env.TZ, noOverlap: true };
    schedule("0 * * * *", () => { void syncKomga().catch(() => undefined); }, options);
    schedule(env.RELEASE_CHECK_CRON, () => { void refreshReleases().catch(() => undefined); }, options);
    schedule(env.BACKUP_CRON, () => { void backupDb().catch(() => undefined); }, options);
    schedule(env.WEEKLY_DIGEST_CRON, () => { void weeklyDigest().catch(() => undefined); }, options);
    schedule("0 10 * * 3", () => { void refreshDiscover().catch(() => undefined); }, options);
    schedule("0 0 * * *", () => { void refreshDiscover("recommended").catch(() => undefined); }, options);
  }
}

