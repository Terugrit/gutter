import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { ComicVineClient } from "./client";

const server = setupServer();
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
    server.listen();
    await expect(new ComicVineClient({ apiKey: "key" }).searchVolumes("Night Signal")).resolves.toMatchObject([{ id: 10 }]);
    server.close();
  });
});
