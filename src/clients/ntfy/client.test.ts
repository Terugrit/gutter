import { describe, expect, it, vi } from "vitest";
import { NtfyClient } from "./client";

describe("NtfyClient", () => {
  it("publishes title, click, cover, and bearer token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
    await new NtfyClient({ baseUrl: "https://ntfy.example/", topic: "comics", token: "secret", fetch: fetcher }).publish({ title: "New: A #1", body: "Issue / date", click: "https://app/notifications/1", attach: "https://cover" });
    expect(fetcher).toHaveBeenCalledWith(new URL("https://ntfy.example/comics"), expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Title: "New: A #1", Click: "https://app/notifications/1", Attach: "https://cover", Authorization: "Bearer secret" }) }));
  });
  it("adds the documented high priority and warning tag headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await new NtfyClient({ baseUrl: "https://ntfy.example", topic: "comics", fetch: fetcher }).publish({ title: "Job failing", body: "broken", priority: "high", tags: "warning" });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ headers: expect.objectContaining({ Priority: "high", Tags: "warning" }) }));
  });
});
