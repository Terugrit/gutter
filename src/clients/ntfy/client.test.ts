import { describe, expect, it, vi } from "vitest";
import { NtfyClient } from "./client";

describe("NtfyClient", () => {
  it("publishes title, click, cover, and bearer token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{"id":"x"}', { status: 200 }));
    await new NtfyClient({ baseUrl: "https://ntfy.example/", topic: "comics", token: "secret", fetch: fetcher }).publish({ title: "New: A #1", body: "Issue / date", click: "https://app/notifications/1", attach: "https://cover" });
    expect(fetcher).toHaveBeenCalledWith(new URL("https://ntfy.example/comics"), expect.objectContaining({ method: "POST", headers: expect.objectContaining({ Title: "New: A #1", Click: "https://app/notifications/1", Attach: "https://cover", Authorization: "Bearer secret" }) }));
  });
  it("encodes non-ASCII title punctuation as a valid HTTP header", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    const title = "New: Amazing Spider-Man #1 — Peter Parker’s Return";
    await expect(new NtfyClient({ baseUrl: "https://ntfy.example", topic: "comics", fetch: fetcher }).publish({ title, body: "Issue / date" })).resolves.toEqual({});
    const sentHeaders = (fetcher.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(sentHeaders.Title).toBe(`=?UTF-8?B?${Buffer.from(title, "utf-8").toString("base64")}?=`);
    expect(() => new Headers(sentHeaders)).not.toThrow();
  });
  it("adds the documented high priority and warning tag headers", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await new NtfyClient({ baseUrl: "https://ntfy.example", topic: "comics", fetch: fetcher }).publish({ title: "Job failing", body: "broken", priority: "high", tags: "warning" });
    expect(fetcher).toHaveBeenCalledWith(expect.any(URL), expect.objectContaining({ headers: expect.objectContaining({ Priority: "high", Tags: "warning" }) }));
  });
  it("serializes two HTTP action buttons in the Actions header", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    await new NtfyClient({ baseUrl: "https://ntfy.example", topic: "comics", fetch: fetcher }).publish({ title: "New issue", body: "Ready", actions: [{ label: "Mark read", url: "https://app.example/api/actions/mark-read", body: "abc.def" }, { label: "Send to Kapowarr", url: "https://app.example/api/actions/send-kapowarr", body: "ghi.jkl" }] });
    const headers = (fetcher.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Actions).toBe("http, Mark read, https://app.example/api/actions/mark-read, method=POST, body=abc.def; http, Send to Kapowarr, https://app.example/api/actions/send-kapowarr, method=POST, body=ghi.jkl");
  });
});
