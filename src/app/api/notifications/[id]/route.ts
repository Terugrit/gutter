import { NextResponse } from "next/server";
import { deleteNotification } from "@/lib/services/notifications";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) return NextResponse.json({ error: "Invalid notification id" }, { status: 400 });
  if (!await deleteNotification(id)) return NextResponse.json({ error: "Notification not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
