import { validate } from "node-cron";
import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));
const schema = z.object({
  GUTTER_DB_PATH: z.string().min(1).default(process.env.NODE_ENV === "production" ? "/data/app.db" : "./data/app.db"),
  BACKUP_DIR: z.string().min(1).optional(), BACKUP_CRON: z.string().default("30 3 * * *").refine(validate, "BACKUP_CRON must be a valid cron expression"),
  KOMGA_URL: optionalUrl, KOMGA_API_KEY: z.string().optional(),
  METRON_USER: z.string().optional(), METRON_PASSWORD: z.string().optional(), COMICVINE_API_KEY: z.string().optional(),
  KAPOWARR_URL: optionalUrl, KAPOWARR_API_KEY: z.string().optional(), NTFY_URL: optionalUrl, NTFY_TOPIC: z.string().regex(/^[-_A-Za-z0-9]{1,64}$/).optional(), NTFY_TOKEN: z.string().optional(),
  APP_BASE_URL: optionalUrl, WEEKLY_DIGEST_CRON: z.string().default("0 9 * * 3"), RELEASE_CHECK_CRON: z.string().default("0 */6 * * *"), TZ: z.string().default("UTC").refine((value) => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "TZ must be a valid IANA time zone"),
  RECOMMENDATION_SEED_COUNT: z.coerce.number().int().min(3).max(5).default(5), RECOMMENDATION_EXCLUSION_DAYS: z.coerce.number().int().min(1).max(90).default(14)
});
export const env = schema.parse(process.env);
