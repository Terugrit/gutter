import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { KapowarrClient } from "./client";

const server = setupServer();
describe("KapowarrClient", () => {
  it("treats an existing ComicVine volume as a successful add", async () => {
    server.use(http.get("http://kapowarr:5656/api/volumes", () => HttpResponse.json({ error: null, result: [{ id: 7, comicvine_id: 42 }] })));
    server.listen();
    await expect(new KapowarrClient({ baseUrl: "http://kapowarr:5656", apiKey: "key" }).addVolume(42)).resolves.toEqual({ volume: { id: 7, comicvine_id: 42 }, existing: true });
    server.close();
  });
  it("adds without auto-search then explicitly starts the search", async () => {
    server.use(
      http.get("http://kapowarr:5656/api/volumes", () => HttpResponse.json({ error: null, result: [] })),
      http.get("http://kapowarr:5656/api/rootfolder", () => HttpResponse.json({ error: null, result: [{ id: 3 }] })),
      http.post("http://kapowarr:5656/api/volumes", async ({ request }) => { expect((await request.json() as { auto_search: boolean }).auto_search).toBe(false); return HttpResponse.json({ error: null, result: { id: 9, comicvine_id: 42 } }, { status: 201 }); }),
      http.post("http://kapowarr:5656/api/system/tasks", async ({ request }) => { expect(await request.json()).toEqual({ cmd: "auto_search", volume_id: 9 }); return HttpResponse.json({ error: null, result: {} }, { status: 201 }); }),
    );
    server.listen();
    const client = new KapowarrClient({ baseUrl: "http://kapowarr:5656", apiKey: "key" });
    const added = await client.addVolume(42); await client.triggerSearch(added.volume.id);
    expect(added.existing).toBe(false); server.close();
  });
  it("preserves a reverse-proxy base path", async () => {
    server.use(http.post("https://comics.example/kapowarr/api/auth/check", ({ request }) => {
      expect(new URL(request.url).searchParams.get("api_key")).toBe("key");
      return HttpResponse.json({ error: null, result: {} });
    }));
    server.listen();
    await expect(new KapowarrClient({ baseUrl: "https://comics.example/kapowarr", apiKey: "key" }).status()).resolves.toBeUndefined();
    server.close();
  });
  it("validates volume issue/files and the download queue", async () => {
    server.use(
      http.get("http://kapowarr:5656/api/volumes/7", () => HttpResponse.json({ error: null, result: { id: 7, comicvine_id: 42, issue_count: 2, issues_downloaded: 1, issues: [{ id: 9, files: [{ id: 22, filepath: "one.cbz", size: 100 }] }, { id: 10, files: [] }] } })),
      http.get("http://kapowarr:5656/api/activity/queue", () => HttpResponse.json({ error: null, result: [{ id: 100, volume_id: 7 }, { id: 101, volume_id: 8 }] })),
    );
    server.listen();
    const client = new KapowarrClient({ baseUrl: "http://kapowarr:5656", apiKey: "key" });
    expect(await client.getVolume(7)).toMatchObject({ issue_count: 2, issues_downloaded: 1 });
    expect(await client.getDownloadQueue()).toHaveLength(2);
    server.close();
  });
});
