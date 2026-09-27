import { NextResponse } from "next/server";
import { getSeriesOverlayDetail } from "@/lib/services/series-overlay";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const detail = await getSeriesOverlayDetail(decodeURIComponent((await params).id));
  return detail ? NextResponse.json(detail) : NextResponse.json({ error: "Series details are not available." }, { status: 404 });
}
