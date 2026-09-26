import { fetchWithRetry } from "@/lib/http";
import { z } from "zod";
import { kapowarrEnvelopeSchema, kapowarrRootFolderSchema, kapowarrVolumeSchema, kapowarrVolumeDetailSchema, kapowarrQueueEntrySchema } from "./schemas";

type Options = { baseUrl: string; apiKey: string; fetch?: typeof fetch };
type Volume = z.infer<typeof kapowarrVolumeSchema>;

export class KapowarrClient {
  private readonly fetcher: typeof fetch;
  constructor(private readonly options: Options) { this.fetcher = options.fetch ?? fetch; }
  private async request<T>(path: string, schema: z.ZodType<T>, init?: RequestInit): Promise<T> {
    // Keep a reverse-proxy base path such as https://example.test/kapowarr.
    const url = new URL(`api${path}`, `${this.options.baseUrl.replace(/\/$/, "")}/`);
    url.searchParams.set("api_key", this.options.apiKey);
    const response = await fetchWithRetry(this.fetcher, url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } }, init?.method === "POST" ? 1 : 3);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) throw new Error(`Kapowarr returned HTML instead of its API response (${response.status}). Check KAPOWARR_URL, including any reverse-proxy base path.`);
    const body = kapowarrEnvelopeSchema(schema).safeParse(await response.json());
    if (!response.ok || !body.success || body.data.error) throw new Error(`Kapowarr request failed (${response.status})`);
    return body.data.result as T;
  }
  async status() { await this.request("/auth/check", z.object({}), { method: "POST", body: "{}" }); }
  async listVolumes(): Promise<Volume[]> { return this.request("/volumes", kapowarrVolumeSchema.array()); }
  async getVolume(volumeId: number) { return this.request(`/volumes/${volumeId}`, kapowarrVolumeDetailSchema); }
  async getDownloadQueue() { return this.request("/activity/queue", kapowarrQueueEntrySchema.array()); }
  async addVolume(comicVineId: number): Promise<{ volume: Volume; existing: boolean }> {
    const existing = (await this.listVolumes()).find((volume) => volume.comicvine_id === comicVineId);
    if (existing) return { volume: existing, existing: true };
    const roots = await this.request("/rootfolder", kapowarrRootFolderSchema.array());
    if (!roots[0]) throw new Error("Kapowarr has no root folder configured");
    const volume = await this.request("/volumes", kapowarrVolumeSchema, { method: "POST", body: JSON.stringify({ comicvine_id: comicVineId, root_folder_id: roots[0].id, monitor: true, monitoring_scheme: "all", monitor_new_issues: true, volume_folder: "", special_version: "auto", auto_search: false }) });
    return { volume, existing: false };
  }
  async triggerSearch(volumeId: number) { await this.request("/system/tasks", z.object({}).nullable(), { method: "POST", body: JSON.stringify({ cmd: "auto_search", volume_id: volumeId }) }); }
}

