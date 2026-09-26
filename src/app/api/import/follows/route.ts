import { ZodError } from "zod";
import { importFollows } from "@/lib/services/follows-transfer";

export async function POST(request: Request) {
  const limit = 5 * 1024 * 1024;
  if (Number(request.headers.get("content-length")) > limit) return Response.json({ error: "Follows file must be smaller than 5 MB." }, { status: 413 });
  let input: unknown;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Empty file");
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); return Response.json({ error: "Follows file must be smaller than 5 MB." }, { status: 413 }); }
      chunks.push(value);
    }
    input = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch { return Response.json({ error: "Choose a valid Gutter follows JSON file." }, { status: 400 }); }
  try {
    const result = await importFollows(input);
    return Response.json({ ...result, message: `${result.imported} follows imported; ${result.refreshed} refreshed.${result.pending ? ` ${result.pending} await metadata. Configure Metron and run Release refresh to retry.` : ""}` });
  } catch (error) {
    if (error instanceof ZodError) return Response.json({ error: `Invalid follows file: ${error.issues[0]?.path.join(".") || "file"}: ${error.issues[0]?.message}` }, { status: 400 });
    return Response.json({ error: "Import could not finish. You can safely retry the same file." }, { status: 500 });
  }
}
