import { exportFollows } from "@/lib/services/follows-transfer";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json(await exportFollows(), { headers: { "Content-Disposition": 'attachment; filename="gutter-follows.json"', "Cache-Control": "no-store" } });
}
