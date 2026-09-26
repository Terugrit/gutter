import { NextResponse } from "next/server";
import { env } from "@/env";
import { type NotificationAction, verifyActionToken } from "@/lib/action-token";

export async function authorizedAction(request: Request, action: NotificationAction) {
  if (!env.ACTION_SECRET) return { error: NextResponse.json({}, { status: 403 }) };
  const body = await request.text();
  if (body.length > 2048) return { error: NextResponse.json({}, { status: 403 }) };
  const result = verifyActionToken(body.trim(), action, env.ACTION_SECRET);
  if (result === "invalid") return { error: NextResponse.json({}, { status: 403 }) };
  if (result === "expired") return { error: NextResponse.json({}, { status: 410 }) };
  return { notificationId: result.notificationId };
}
