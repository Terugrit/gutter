import { LibraryClient } from "./library-client";
import { getLiveLibrary } from "@/lib/services/library";
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ followed?: string; attention?: string }> }) { const params = await searchParams; return <LibraryClient initial={(await getLiveLibrary()) ?? []} initialFollowed={params.followed === "1"} attention={params.attention === "1"} />; }
