import { describe, expect, it } from "vitest";
import { optionsToEnvironment } from "./home-assistant-options.mjs";

describe("Home Assistant options", () => {
  it("maps configuration names to Gutter environment variables", () => {
    expect(optionsToEnvironment({
      komga_url: "http://komga:25600",
      komga_api_key: "secret",
      recommendation_seed_count: 4,
      timezone: "Europe/Amsterdam",
    })).toEqual({
      KOMGA_URL: "http://komga:25600",
      KOMGA_API_KEY: "secret",
      RECOMMENDATION_SEED_COUNT: "4",
      TZ: "Europe/Amsterdam",
    });
  });

  it("does not replace optional environment variables with blank values", () => {
    expect(optionsToEnvironment({ ntfy_token: "", backup_dir: null })).toEqual({});
  });

  it("rejects nested configuration values", () => {
    expect(() => optionsToEnvironment({ komga_url: { value: "no" } })).toThrow(/scalar value/);
  });
});
