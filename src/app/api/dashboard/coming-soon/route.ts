import { NextResponse } from "next/server";
import { getComingSoon } from "@/lib/services/coming-soon";

export async function GET() { return NextResponse.json({ items: await getComingSoon() }); }
