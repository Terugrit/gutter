import type { NtfyAction } from "@/clients/ntfy/client";
import { createActionToken } from "./action-token";

export function notificationActions(notificationId: number, baseUrl: string, secret: string | undefined, comicVineVolumeId: number | null, kapowarrVolumeId: number | null): NtfyAction[] {
  if (!secret) return [];
  const base = baseUrl.replace(/\/$/, "");
  const actions: NtfyAction[] = [{ label: "Mark read", url: `${base}/api/actions/mark-read`, body: createActionToken("mark-read", notificationId, secret) }];
  if (comicVineVolumeId && !kapowarrVolumeId) actions.push({ label: "Send to Kapowarr", url: `${base}/api/actions/send-kapowarr`, body: createActionToken("send-kapowarr", notificationId, secret) });
  return actions;
}
