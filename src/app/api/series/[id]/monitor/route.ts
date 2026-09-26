import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { followedSeries } from "@/db/schema";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const input = z.object({ mode: z.enum(["future_only", "all"]) }).safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Choose Future only or All issues." }, { status: 400 });
  const updated = await db.update(followedSeries).set({ monitorMode: input.data.mode }).where(and(eq(followedSeries.komgaSeriesId, decodeURIComponent((await params).id)), eq(followedSeries.active, true))).returning({ id: followedSeries.id });
  return updated.length ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Followed series not found" }, { status: 404 });
}

