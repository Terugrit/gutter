import { NextResponse } from "next/server";
import { clearNotifications } from "@/lib/services/notifications";

export async function DELETE() {
  return NextResponse.json({ ok: true, count: await clearNotifications() });
}
