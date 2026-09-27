import { NextResponse } from "next/server";
import { removeFromReadingShelf } from "@/lib/services/reading-shelf";

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid series" }, { status: 400 });
  await removeFromReadingShelf(id);
  return NextResponse.json({ ok: true });
}
