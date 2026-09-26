import { LibraryClient } from "./library-client";
import { getLiveLibrary } from "@/lib/services/library";
import { getFollowSuggestions } from "@/lib/services/follow-suggestions";
export default async function LibraryPage({ searchParams }: { searchParams: Promise<{ followed?: string; attention?: string }> }) { const params = await searchParams; const [library, suggestions] = await Promise.all([getLiveLibrary(), getFollowSuggestions()]); return <LibraryClient initial={library ?? []} suggestions={suggestions} initialFollowed={params.followed === "1"} attention={params.attention === "1"} />; }
