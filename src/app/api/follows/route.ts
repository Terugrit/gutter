import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { followedSeries } from "@/db/schema";
import { autoMatchFollowedSeries } from "@/lib/services/metron";
import { unfollowSeries } from "@/lib/services/series";
const input = z.object({ series: z.array(z.object({ id: z.string(), title: z.string(), publisher: z.string().optional() })).min(1) });
export async function POST(request: Request) { const parsed = input.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid series" }, { status: 400 }); for (const item of parsed.data.series) await db.insert(followedSeries).values({ komgaSeriesId: item.id, title: item.title, publisher: item.publisher }).onConflictDoUpdate({ target: followedSeries.komgaSeriesId, set: { active: true, title: item.title, publisher: item.publisher } }); const results = await Promise.all(parsed.data.series.map(async (item) => { try { return await autoMatchFollowedSeries(item.id); } catch { return { status: "unmatched" as const }; } })); return NextResponse.json({ ok: true, results }); }
export async function DELETE(request: Request) { const parsed = z.object({ ids: z.array(z.string().min(1)).min(1) }).safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid series" }, { status: 400 }); await Promise.all(parsed.data.ids.map(unfollowSeries)); return NextResponse.json({ ok: true }); }
