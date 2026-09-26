import { beforeEach, describe, expect, it, vi } from "vitest";

const { publish } = vi.hoisted(() => ({ publish: vi.fn() }));
vi.mock("@/env", () => ({ env: { TZ: "UTC", NTFY_URL: "https://ntfy.example", NTFY_TOPIC: "gutter", APP_BASE_URL: "https://gutter.example" } }));
vi.mock("@/clients/ntfy/client", () => ({ NtfyClient: class { publish = publish; } }));
vi.mock("@/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const sqlite = new Database(":memory:");
  sqlite.exec("CREATE TABLE kv_cache (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, fetched_at TEXT NOT NULL, ttl_seconds INTEGER NOT NULL)");
  return { db: drizzle(sqlite), sqlite };
});
import { sqlite } from "@/db";
import { getJobStatus, JOB_FAILURE_ALERT_AFTER, runTrackedJob } from "./status";

const fail = () => runTrackedJob("sync-komga", async () => { throw new Error("broken".repeat(50)); });
describe("tracked job alerts", () => {
  beforeEach(() => { sqlite.exec("DELETE FROM kv_cache"); publish.mockReset().mockResolvedValue({}); });
  it("alerts once at the second failure, then sends a recovery", async () => {
    expect(JOB_FAILURE_ALERT_AFTER).toBe(2);
    await expect(fail()).rejects.toThrow();
    expect(publish).not.toHaveBeenCalled();
    await expect(fail()).rejects.toThrow();
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ title: "Gutter: sync-komga is failing", priority: "high", tags: "warning", click: "https://gutter.example/settings" }));
    expect(publish.mock.calls[0][0].body).toHaveLength(200);
    await expect(fail()).rejects.toThrow();
    expect(publish).toHaveBeenCalledTimes(1);
    await runTrackedJob("sync-komga", async () => 1);
    expect(publish).toHaveBeenCalledWith(expect.objectContaining({ title: "Gutter: sync-komga recovered" }));
    expect(await getJobStatus("sync-komga")).toMatchObject({ state: "success", consecutiveFailures: 0 });
  });
  it("retries the warning if ntfy fails", async () => {
    publish.mockRejectedValueOnce(new Error("ntfy down"));
    await expect(fail()).rejects.toThrow();
    await expect(fail()).rejects.toThrow();
    expect((await getJobStatus("sync-komga"))?.failureAlertedAt).toBeUndefined();
    await expect(fail()).rejects.toThrow();
    expect(publish).toHaveBeenCalledTimes(2);
    expect((await getJobStatus("sync-komga"))?.failureAlertedAt).toBeTruthy();
  });
});
