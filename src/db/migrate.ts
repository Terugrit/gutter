import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { env } from "../env";
import { migrateSchema } from "./migrate-schema";
const path = env.GUTTER_DB_PATH;
if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
const sqlite = new Database(path);
try { migrateSchema(sqlite); } finally { sqlite.close(); }
