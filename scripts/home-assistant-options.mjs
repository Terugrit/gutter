import { readFile } from "node:fs/promises";

export const HOME_ASSISTANT_OPTIONS_PATH = "/data/options.json";

const optionToEnvironment = {
  komga_url: "KOMGA_URL",
  komga_api_key: "KOMGA_API_KEY",
  metron_user: "METRON_USER",
  metron_password: "METRON_PASSWORD",
  comicvine_api_key: "COMICVINE_API_KEY",
  kapowarr_url: "KAPOWARR_URL",
  kapowarr_api_key: "KAPOWARR_API_KEY",
  kapowarr_check_cron: "KAPOWARR_CHECK_CRON",
  ntfy_url: "NTFY_URL",
  ntfy_topic: "NTFY_TOPIC",
  ntfy_token: "NTFY_TOKEN",
  action_secret: "ACTION_SECRET",
  app_base_url: "APP_BASE_URL",
  weekly_digest_cron: "WEEKLY_DIGEST_CRON",
  release_check_cron: "RELEASE_CHECK_CRON",
  timezone: "TZ",
  recommendation_seed_count: "RECOMMENDATION_SEED_COUNT",
  recommendation_exclusion_days: "RECOMMENDATION_EXCLUSION_DAYS",
  backup_cron: "BACKUP_CRON",
  backup_dir: "BACKUP_DIR",
};

export function optionsToEnvironment(options) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError("Home Assistant options must be a JSON object");
  }

  return Object.fromEntries(
    Object.entries(optionToEnvironment).flatMap(([option, environment]) => {
      const value = options[option];
      if (value === undefined || value === null || value === "") return [];
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
        throw new TypeError(`Home Assistant option ${option} must be a scalar value`);
      }
      return [[environment, String(value)]];
    }),
  );
}

export async function loadHomeAssistantEnvironment(path = HOME_ASSISTANT_OPTIONS_PATH) {
  try {
    const options = JSON.parse(await readFile(path, "utf8"));
    return optionsToEnvironment(options);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return {};
    throw new Error(`Unable to load Home Assistant configuration from ${path}`, { cause: error });
  }
}
