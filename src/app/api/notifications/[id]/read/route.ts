import { NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/services/notifications";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
  let unread = false;
  try { unread = Boolean((await request.json()).unread); } catch { /* Empty PATCH marks read. */ }
  if (!await markNotificationRead(id, unread)) return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
