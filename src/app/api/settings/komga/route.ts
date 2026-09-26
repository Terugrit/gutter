import { NextResponse } from "next/server";
import { z } from "zod";
import { KomgaClient } from "@/clients/komga/client";
import { env } from "@/env";
import { getSelectedKomgaLibrary, saveSelectedKomgaLibrary } from "@/lib/services/settings";
import { syncKomga } from "@/jobs/sync-komga";
const selection = z.object({ libraryId: z.string().min(1) });
function client() { return env.KOMGA_URL && env.KOMGA_API_KEY ? new KomgaClient({ baseUrl: env.KOMGA_URL, apiKey: env.KOMGA_API_KEY }) : null; }
export async function GET() { const komga = client(); if (!komga) return NextResponse.json({ error: "Komga is not configured" }, { status: 400 }); try { const [libraries, selectedLibrary] = await Promise.all([komga.listLibraries(), getSelectedKomgaLibrary()]); return NextResponse.json({ libraries, selectedLibraryId: selectedLibrary?.id ?? null }); } catch { return NextResponse.json({ error: "Komga is not reachable" }, { status: 502 }); } }
export async function POST() { const komga = client(); if (!komga) return NextResponse.json({ ok: false, message: "○ Not configured" }, { status: 400 }); try { await komga.testConnection(); return NextResponse.json({ ok: true, message: "● Connected" }); } catch (error) { return NextResponse.json({ ok: false, message: `○ Not reachable: ${error instanceof Error ? error.message : "Request failed"}` }, { status: 502 }); } }
export async function PUT(request: Request) { const parsed = selection.safeParse(await request.json()); if (!parsed.success) return NextResponse.json({ error: "Invalid library" }, { status: 400 }); const komga = client(); if (!komga) return NextResponse.json({ error: "Komga is not configured" }, { status: 400 }); try { const libraries = await komga.listLibraries(); const library = libraries.find((item) => item.id === parsed.data.libraryId); if (!library) return NextResponse.json({ error: "Library is not available to this API key" }, { status: 400 }); await saveSelectedKomgaLibrary(library); await syncKomga(); return NextResponse.json({ ok: true }); } catch { return NextResponse.json({ error: "Komga is not reachable" }, { status: 502 }); } }
