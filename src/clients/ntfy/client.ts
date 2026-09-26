import { fetchWithRetry } from "@/lib/http";
import { z } from "zod";

const responseSchema = z.object({ id: z.string().optional() }).passthrough();

export type NtfyMessage = { title: string; body: string; click?: string; attach?: string; priority?: "high"; tags?: string };

export class NtfyClient {
  constructor(private readonly options: { baseUrl: string; topic: string; token?: string; fetch?: typeof fetch }) {}

  async publish(message: NtfyMessage) {
    const url = new URL(this.options.topic, `${this.options.baseUrl.replace(/\/$/, "")}/`);
    const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8", Title: message.title };
    if (message.click) headers.Click = message.click;
    if (message.attach) headers.Attach = message.attach;
    if (message.priority) headers.Priority = message.priority;
    if (message.tags) headers.Tags = message.tags;
    if (this.options.token) headers.Authorization = `Bearer ${this.options.token}`;
    const response = await fetchWithRetry(this.options.fetch ?? fetch, url, { method: "POST", headers, body: message.body }, 1);
    if (!response.ok) throw new Error(`ntfy request failed (${response.status})`);
    const text = await response.text();
    return text ? responseSchema.parse(JSON.parse(text)) : {};
  }
}

