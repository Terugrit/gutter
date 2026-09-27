import { NextResponse } from "next/server";
import { getReleaseShelf } from "@/lib/services/coming-soon";

export async function GET() { return NextResponse.json({ items: await getReleaseShelf() }); }
