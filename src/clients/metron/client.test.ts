import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { MetronClient } from "./client";

const server = setupServer();
describe("MetronClient", () => {
  it("searches English series with documented filters", async () => {
    server.use(http.get("https://metron.cloud/api/series/", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("name")).toBe("Night Signal");
      expect(url.searchParams.get("publisher_name")).toBe("Atlas");
      expect(url.searchParams.get("year_began")).toBe("2024");
      expect(url.searchParams.get("language")).toBe("en");
      return HttpResponse.json({ count: 1, next: null, previous: null, results: [{ id: 10, series: "Night Signal", year_began: 2024, publisher: { id: 2, name: "Atlas" }, cv_id: 99, language: "en" }] });
    }));
    server.listen();
    await expect(new MetronClient({ username: "u", password: "p" }).searchSeries({ name: "Night Signal", publisher: "Atlas", year: 2024 })).resolves.toHaveLength(1);
    server.close();
  });
  it("reads a series issue list", async () => {
    server.use(http.get("https://metron.cloud/api/series/10/issue_list/", () => HttpResponse.json({ count: 1, next: null, previous: null, results: [{ id: 22, number: "1", issue: "Night Signal #1", store_date: "2026-01-01", image: null }] })));
    server.listen();
    await expect(new MetronClient({ username: "u", password: "p" }).listIssues(10)).resolves.toMatchObject([{ id: 22, number: "1" }]);
    server.close();
  });
  it("searches creators and filters series by creator", async () => {
    server.use(
      http.get("https://metron.cloud/api/creator/", ({ request }) => { expect(new URL(request.url).searchParams.get("name")).toBe("Mara Okonkwo"); return HttpResponse.json({ count: 1, next: null, previous: null, results: [{ id: 7, name: "Mara Okonkwo" }] }); }),
      http.get("https://metron.cloud/api/series/", ({ request }) => { expect(new URL(request.url).searchParams.get("creator_id")).toBe("7"); return HttpResponse.json({ count: 0, next: null, previous: null, results: [] }); }),
    );
    server.listen();
    const client = new MetronClient({ username: "u", password: "p" });
    await expect(client.searchCreators("Mara Okonkwo")).resolves.toEqual([{ id: 7, name: "Mara Okonkwo" }]);
    await expect(client.searchSeries({ creatorId: 7 })).resolves.toEqual([]);
    server.close();
  });
  it("samples distinct English series pages and reuses page one", async () => {
    const pages: number[] = [];
    server.use(http.get("https://metron.cloud/api/series/", ({ request }) => {
      const url = new URL(request.url);
      expect(url.searchParams.get("language")).toBe("en");
      expect(url.searchParams.get("name")).toBeNull();
      const page = Number(url.searchParams.get("page"));
      pages.push(page);
      return HttpResponse.json({ count: 60, next: page < 6 ? `https://metron.cloud/api/series/?page=${page + 1}` : null, results: Array.from({ length: 10 }, (_, index) => ({ id: page * 10 + index, series: `Series ${page}-${index}`, language: "en" })) });
    }));
    server.listen();
    const results = await new MetronClient({ username: "u", password: "p" }).sampleSeriesPages(5, () => 0);
    expect(pages).toHaveLength(5);
    expect(new Set(pages).size).toBe(5);
    expect(pages.filter((page) => page === 1)).toHaveLength(1);
    expect(results).toHaveLength(50);
    server.close();
  });
});
