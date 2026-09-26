import { mkdir, readdir, realpath, rename, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { sqlite } from "@/db";
import { env } from "@/env";
import { localDate, runTrackedJob } from "./status";

export const BACKUP_RETENTION = 7;
export async function backupDb(now = new Date()) {
  return runTrackedJob("backup-db", async () => {
    const directory = resolve(env.BACKUP_DIR ?? resolve(dirname(env.GUTTER_DB_PATH), "backups"));
    await mkdir(directory, { recursive: true });
    const canonicalDirectory = await realpath(directory);
    const live = env.GUTTER_DB_PATH === ":memory:" ? null : await realpath(env.GUTTER_DB_PATH);
    const samePath = (left: string, right: string | null) => right !== null && (process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right);
    const destination = resolve(directory, `gutter-${localDate(now)}.db`);
    const temporary = resolve(directory, `.gutter-${randomUUID()}.tmp`);
    if (samePath(resolve(canonicalDirectory, `gutter-${localDate(now)}.db`), live)) throw new Error("Backup destination must differ from the live database.");
    try {
      await sqlite.backup(temporary);
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
    const copies = (await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^gutter-\d{4}-\d{2}-\d{2}\.db$/.test(entry.name))
      .map((entry) => entry.name).sort().reverse();
    for (const name of copies.slice(BACKUP_RETENTION)) {
      const target = resolve(directory, name);
      if (dirname(target) !== directory || samePath(resolve(canonicalDirectory, name), live)) throw new Error("Unsafe backup retention path.");
      await rm(target);
    }
    return { filename: `gutter-${localDate(now)}.db` };
  });
}
