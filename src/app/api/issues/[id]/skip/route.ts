import { NextResponse } from "next/server";
import { z } from "zod";
import { setIssueSkipped } from "@/lib/services/issue-controls";

const input = z.object({ skipped: z.boolean() }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const rawId = (await context.params).id;
  const id = z.coerce.number().int().positive().safeParse(rawId);
  const body = input.safeParse(await request.json().catch(() => null));
  if (!/^\d+$/.test(rawId) || !id.success || !body.success) return NextResponse.json({ error: "Provide an issue ID and skipped: true or false." }, { status: 400 });
  const issue = await setIssueSkipped(id.data, body.data.skipped);
  if (!issue) return NextResponse.json({ error: "Active issue not found." }, { status: 404 });
  return NextResponse.json(issue);
}
