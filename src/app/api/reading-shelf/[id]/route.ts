import { NextResponse } from "next/server";
import { removeReleaseShelfItem } from "@/lib/services/coming-soon";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid shelf item." }, { status: 400 });
  await removeReleaseShelfItem(id);
  return NextResponse.json({ ok: true });
}
