import { defineConfig } from "drizzle-kit";
import { env } from "./src/env";
export default defineConfig({ schema: "./src/db/schema.ts", out: "./drizzle", dialect: "sqlite", dbCredentials: { url: env.GUTTER_DB_PATH } });
