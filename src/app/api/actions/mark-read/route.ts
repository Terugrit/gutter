import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { notifications } from "@/db/schema";
import { authorizedAction } from "../verify";

export async function POST(request: Request) {
  const auth = await authorizedAction(request, "mark-read");
  if (auth.error) return auth.error;
  const row = (await db.select({ id: notifications.id }).from(notifications).where(and(eq(notifications.id, auth.notificationId!), eq(notifications.type, "new_release"))))[0];
  if (!row) return NextResponse.json({}, { status: 403 });
  await db.update(notifications).set({ readAt: new Date().toISOString() }).where(and(eq(notifications.id, row.id), isNull(notifications.readAt)));
  return NextResponse.json({ ok: true });
}
