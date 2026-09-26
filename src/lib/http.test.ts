import { describe, expect, it, vi } from "vitest";
import { fetchWithRetry } from "./http";

describe("fetchWithRetry", () => {
  it("retries 429 responses and uses the next successful response", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("busy", { status: 429, headers: { "Retry-After": "0" } })).mockResolvedValueOnce(new Response("ok"));
    const response = await fetchWithRetry(fetcher, "https://example.test/api");
    expect(await response.text()).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("retries a network error and returns the successful response", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(new Response("ok"));
    const response = await fetchWithRetry(fetcher, "https://example.test/api");
    expect(await response.text()).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("stops retrying network errors after the configured attempts", async () => {
    const error = new TypeError("fetch failed");
    const fetcher = vi.fn().mockRejectedValue(error);
    await expect(fetchWithRetry(fetcher, "https://example.test/api", {}, 2)).rejects.toBe(error);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not retry an aborted caller signal", async () => {
    const controller = new AbortController();
    controller.abort();
    const error = new TypeError("fetch failed");
    const fetcher = vi.fn().mockRejectedValue(error);
    await expect(fetchWithRetry(fetcher, "https://example.test/api", { signal: controller.signal })).rejects.toBe(error);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("does not retry a non-idempotent request when limited to one attempt", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("busy", { status: 429 }));
    expect((await fetchWithRetry(fetcher, "https://example.test/api", { method: "POST" }, 1)).status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("stops retrying when the observed quota is exhausted", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("limited", { status: 429, headers: { "X-RateLimit-Burst-Remaining": "0" } }));
    const response = await fetchWithRetry(fetcher, "https://example.test/api", {}, 3, (value) => value.headers.get("X-RateLimit-Burst-Remaining") !== "0");
    expect(response.status).toBe(429);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
