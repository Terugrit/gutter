import { NextResponse } from "next/server";
import { getUnreadNotificationCount } from "@/lib/services/notifications";
export const dynamic = "force-dynamic";
export async function GET() { return NextResponse.json({ count: await getUnreadNotificationCount() }); }
