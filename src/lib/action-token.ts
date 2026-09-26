import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const ACTION_TOKEN_DAYS = 30;
const payloadSchema = z.object({ action: z.enum(["mark-read", "send-kapowarr"]), notificationId: z.number().int().positive(), expiresAt: z.number().int().positive() });
export type NotificationAction = z.infer<typeof payloadSchema>["action"];
export function createActionToken(action: NotificationAction, notificationId: number, secret: string, now = Date.now()) {
  const body = Buffer.from(JSON.stringify({ action, notificationId, expiresAt: now + ACTION_TOKEN_DAYS * 86400000 })).toString("base64url");
  const mac = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}
export function verifyActionToken(token: string, action: NotificationAction, secret: string, now = Date.now()): { notificationId: number } | "invalid" | "expired" {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))) return "invalid";
  const expected = createHmac("sha256", secret).update(parts[0]).digest();
  const supplied = Buffer.from(parts[1], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return "invalid";
  let decoded: unknown;
  try { decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); } catch { return "invalid"; }
  const payload = payloadSchema.safeParse(decoded);
  if (!payload.success || payload.data.action !== action) return "invalid";
  if (payload.data.expiresAt <= now) return "expired";
  return { notificationId: payload.data.notificationId };
}
