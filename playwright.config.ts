import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";
const visualDb = resolve("data/visual-test.db");
process.env.GUTTER_DB_PATH = visualDb;
export default defineConfig({ testDir: "./tests/visual", snapshotPathTemplate: "{testDir}/snapshots/{arg}{ext}", workers: 1, use: { baseURL: "http://127.0.0.1:3001" }, webServer: { command: "node tests/visual/start-server.mjs", url: "http://127.0.0.1:3001", reuseExistingServer: false, env: { GUTTER_DB_PATH: visualDb, BACKUP_DIR: resolve("data/visual-backups"), GUTTER_VISUAL_TEST: "1", KOMGA_URL: "http://127.0.0.1:65534", KOMGA_API_KEY: "visual-test" } } });


