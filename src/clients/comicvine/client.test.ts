import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ComicVineClient } from "./client";

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
describe("ComicVineClient", () => {
  it("searches only volumes using the documented search parameters", async () => {
    server.use(http.get("https://comicvine.gamespot.com/api/search/", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("api_key")).toBe("key");
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("resources")).toBe("volume");
      expect(url.searchParams.get("query")).toBe("Night Signal");
      return HttpResponse.json({ status_code: 1, error: "OK", results: [{ id: 10, name: "Night Signal", start_year: "2024", resource_type: "volume" }] });
    }));
    await expect(new ComicVineClient({ apiKey: "key" }).searchVolumes("Night Signal")).resolves.toMatchObject([{ id: 10 }]);
  });
  it("resolves an embedded issue URL to its parent volume with a minimal request", async () => {
    server.use(http.get("https://comicvine.gamespot.com/api/issue/4000-873262/", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("api_key")).toBe("key");
      expect(url.searchParams.get("format")).toBe("json");
      expect(url.searchParams.get("field_list")).toBe("volume");
      return HttpResponse.json({ status_code: 1, error: "OK", results: { id: 873262, volume: { id: 10 } } });
    }));
    await expect(new ComicVineClient({ apiKey: "key" }).getIssueVolumeId(873262)).resolves.toBe(10);
  });
  it("returns null when ComicVine cannot find the issue", async () => {
    server.use(http.get("https://comicvine.gamespot.com/api/issue/4000-999999/", () => HttpResponse.json({ status_code: 101, error: "Object Not Found", results: null })));
    await expect(new ComicVineClient({ apiKey: "key" }).getIssueVolumeId(999999)).resolves.toBeNull();
  });
});
