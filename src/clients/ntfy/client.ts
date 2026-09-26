import { fetchWithRetry } from "@/lib/http";
import { z } from "zod";

const responseSchema = z.object({ id: z.string().optional() }).passthrough();

export type NtfyAction = { label: "Mark read" | "Send to Kapowarr"; url: string; body: string };
export type NtfyMessage = { title: string; body: string; click?: string; attach?: string; priority?: "high"; tags?: string; actions?: NtfyAction[] };

// ntfy header values travel as HTTP headers, which reject anything outside Latin-1. Comic titles
// routinely carry em dashes, curly quotes, and accents, so non-ASCII values are RFC 2047-encoded;
// the ntfy server decodes this natively. See https://docs.ntfy.sh/publish/#e-mail-style-headers
function encodeHeader(value: string) {
  return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf-8").toString("base64")}?=`;
}

export class NtfyClient {
  constructor(private readonly options: { baseUrl: string; topic: string; token?: string; fetch?: typeof fetch }) {}

  async publish(message: NtfyMessage) {
    const url = new URL(this.options.topic, `${this.options.baseUrl.replace(/\/$/, "")}/`);
    const headers: Record<string, string> = { "Content-Type": "text/plain; charset=utf-8", Title: encodeHeader(message.title) };
    if (message.click) headers.Click = message.click;
    if (message.attach) headers.Attach = message.attach;
    if (message.priority) headers.Priority = message.priority;
    if (message.tags) headers.Tags = encodeHeader(message.tags);
    if (message.actions?.length) {
      if (message.actions.length > 2) throw new Error("At most two ntfy actions are supported");
      headers.Actions = message.actions.map((action) => {
        if (!/^https?:\/\/[^,;\s]+$/.test(action.url) || !/^[A-Za-z0-9_.-]+$/.test(action.body)) throw new Error("Invalid ntfy action");
        return `http, ${action.label}, ${action.url}, method=POST, body=${action.body}`;
      }).join("; ");
    }
    if (this.options.token) headers.Authorization = `Bearer ${this.options.token}`;
    const response = await fetchWithRetry(this.options.fetch ?? fetch, url, { method: "POST", headers, body: message.body }, 1);
    if (!response.ok) throw new Error(`ntfy request failed (${response.status})`);
    const text = await response.text();
    return text ? responseSchema.parse(JSON.parse(text)) : {};
  }
}

