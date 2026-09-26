import { fetchWithRetry } from "@/lib/http";
import { comicVineResponseSchema, type ComicVineVolume } from "./schemas";

type Options = { apiKey: string; baseUrl?: string; fetch?: typeof fetch };

export class ComicVineClient {
  private readonly fetcher: typeof fetch;
  private readonly baseUrl: string;
  constructor(options: Options) { this.fetcher = options.fetch ?? fetch; this.baseUrl = options.baseUrl ?? "https://comicvine.gamespot.com/api/"; this.apiKey = options.apiKey; }
  private readonly apiKey: string;

  async searchVolumes(query: string): Promise<ComicVineVolume[]> {
    const url = new URL("search/", this.baseUrl);
    url.searchParams.set("api_key", this.apiKey);
    url.searchParams.set("format", "json");
    url.searchParams.set("resources", "volume");
    url.searchParams.set("query", query);
    const response = await fetchWithRetry(this.fetcher, url);
    if (!response.ok) throw new Error(`ComicVine request failed (${response.status})`);
    const result = comicVineResponseSchema.parse(await response.json());
    if (result.status_code !== 1) throw new Error(`ComicVine request failed (${result.error})`);
    return result.results.filter((volume) => !volume.resource_type || volume.resource_type === "volume");
  }
}

