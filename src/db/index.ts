import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";
import { env } from "../env";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { migrateSchema } from "./migrate-schema";

const path = env.GUTTER_DB_PATH;
if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
export const sqlite = new Database(path);
sqlite.pragma("journal_mode = WAL");
try { migrateSchema(sqlite); } catch (error) { sqlite.close(); throw error; }
export const db = drizzle(sqlite, { schema });
