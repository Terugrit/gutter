import { DiscoverClient } from "./discover-client";
import { getRecommendations } from "@/lib/services/recommendations";
import { getSavedShelfIds } from "@/lib/services/reading-shelf";
export default async function DiscoverPage() { const [data, savedIds] = await Promise.all([getRecommendations(), getSavedShelfIds()]); return <DiscoverClient data={data} savedIds={savedIds} />; }
