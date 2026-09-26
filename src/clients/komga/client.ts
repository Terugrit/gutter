import { fetchWithRetry } from "@/lib/http";
import { komgaBookSchema, komgaLibrarySchema, komgaPageSchema, komgaSeriesSchema, type KomgaBook, type KomgaLibrary, type KomgaSeries } from "./schemas";
type Options = { baseUrl: string; apiKey: string; fetch?: typeof fetch };
export class KomgaClient {
  private fetcher: typeof fetch;
  constructor(private readonly options: Options) { this.fetcher = options.fetch ?? fetch; }
  private async list<T>(path: string, schema: ReturnType<typeof komgaPageSchema>, page: number, libraryId?: string): Promise<{ content: T[]; last: boolean }> { const url = new URL(path, this.options.baseUrl); url.searchParams.set("page", String(page)); url.searchParams.set("size", "100"); const body = libraryId ? { condition: { libraryId: { operator: "is", value: libraryId } } } : {}; const response = await fetchWithRetry(this.fetcher, url, { method: "POST", headers: { "X-API-Key": this.options.apiKey, "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`Komga request failed (${response.status})`); const parsed = schema.parse(await response.json()); return { content: parsed.content as T[], last: parsed.last ?? page + 1 >= (parsed.totalPages ?? 1) }; }
  private async all<T>(path: string, schema: ReturnType<typeof komgaPageSchema>, libraryId?: string) { const records: T[] = []; for (let page = 0; ; page += 1) { const result = await this.list<T>(path, schema, page, libraryId); records.push(...result.content); if (result.last) return records; } }
  listSeries(libraryId?: string): Promise<KomgaSeries[]> { return this.all<KomgaSeries>("/api/v1/series/list", komgaPageSchema(komgaSeriesSchema), libraryId); }
  listBooks(libraryId?: string): Promise<KomgaBook[]> { return this.all<KomgaBook>("/api/v1/books/list", komgaPageSchema(komgaBookSchema), libraryId); }
  async listLibraries(): Promise<KomgaLibrary[]> { const response = await fetchWithRetry(this.fetcher, new URL("/api/v1/libraries", this.options.baseUrl), { headers: { "X-API-Key": this.options.apiKey } }); if (!response.ok) throw new Error(`Komga request failed (${response.status})`); return komgaLibrarySchema.array().parse(await response.json()); }
  async testConnection() { await this.list<KomgaSeries>("/api/v1/series/list", komgaPageSchema(komgaSeriesSchema), 0); }
  thumbnailPath(seriesId: string) { return `/api/komga/series/${encodeURIComponent(seriesId)}/thumbnail`; }
  async thumbnail(seriesId: string) { const response = await fetchWithRetry(this.fetcher, new URL(`/api/v1/series/${encodeURIComponent(seriesId)}/thumbnail`, this.options.baseUrl), { headers: { "X-API-Key": this.options.apiKey } }); if (!response.ok) throw new Error(`Komga thumbnail failed (${response.status})`); return response; }
}

