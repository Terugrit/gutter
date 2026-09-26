import { fetchWithRetry } from "@/lib/http";
import { enqueueRateLimited, observeRateLimitHeaders } from "@/lib/rate-limit-queue";
import { metronCreatorSchema, metronIssueSchema, metronPageSchema, metronSeriesSchema, metronSeriesDetailSchema, type MetronCreator, type MetronIssue, type MetronSeries } from "./schemas";

type Options = { username: string; password: string; baseUrl?: string; fetch?: typeof fetch };
export type SeriesSearch = { name?: string; publisher?: string; year?: number; comicVineId?: number; creatorId?: number; maxPages?: number };

export class MetronClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  private readonly authorization: string;
  constructor(options: Options) {
    this.fetcher = options.fetch ?? fetch;
    this.baseUrl = options.baseUrl ?? "https://metron.cloud/api/";
    this.authorization = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString("base64")}`;
  }
  private async get<T>(path: string, schema: { parse(value: unknown): T }, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(path, this.baseUrl);
    for (const [key, value] of Object.entries(params ?? {})) if (value !== undefined) url.searchParams.set(key, String(value));
    return enqueueRateLimited(async () => {
      const response = await fetchWithRetry(this.fetcher, url, { headers: { Authorization: this.authorization } }, 3, (value) => !observeRateLimitHeaders(value.headers));
      if (!response.ok) throw new Error(`Metron request failed (${response.status})`);
      return schema.parse(await response.json());
    });
  }
  async searchSeries(search: SeriesSearch = {}): Promise<MetronSeries[]> {
    const results: MetronSeries[] = [];
    for (let page = 1; page <= (search.maxPages ?? 10); page += 1) {
      const response = await this.get("series/", metronPageSchema(metronSeriesSchema), { name: search.name, publisher_name: search.publisher, year_began: search.year, cv_id: search.comicVineId, creator_id: search.creatorId, language: "en", page });
      results.push(...response.results.filter((series) => !series.language || series.language === "en"));
      if (!response.next) break;
    }
    return results;
  }
  async sampleSeriesPages(maxPages = 5, random = Math.random): Promise<MetronSeries[]> {
    const page = (number: number) => this.get("series/", metronPageSchema(metronSeriesSchema), { language: "en", page: number });
    const first = await page(1);
    if (!first.results.length) return [];
    const pageCount = Math.ceil(first.count / first.results.length);
    const available = Array.from({ length: Math.max(0, pageCount - 1) }, (_, index) => index + 2);
    for (let i = available.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [available[i], available[j]] = [available[j], available[i]]; }
    const sampled = [1, ...available.slice(0, Math.max(0, maxPages - 1))].sort((a, b) => a - b);
    const results = [...first.results];
    for (const number of sampled.slice(1)) results.push(...(await page(number)).results);
    return results.filter((series) => !series.language || series.language === "en");
  }
  async getSeries(id: number): Promise<MetronSeries> { return this.get(`series/${id}/`, metronSeriesDetailSchema); }
  async searchCreators(name: string): Promise<MetronCreator[]> { return (await this.get("creator/", metronPageSchema(metronCreatorSchema), { name })).results; }
  async getIssue(id: number): Promise<MetronIssue> { return this.get(`issue/${id}/`, metronIssueSchema); }
  async listIssues(seriesId: number, maxPages = Number.POSITIVE_INFINITY): Promise<MetronIssue[]> {
    const results: MetronIssue[] = [];
    for (let page = 1; page <= maxPages; page += 1) {
      const response = await this.get(`series/${seriesId}/issue_list/`, metronPageSchema(metronIssueSchema), { page });
      results.push(...response.results);
      if (!response.next) break;
    }
    return results;
  }
}

