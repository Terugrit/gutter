import { DiscoverClient } from "./discover-client";
import { getRecommendations } from "@/lib/services/recommendations";
export default async function DiscoverPage() { return <DiscoverClient data={await getRecommendations()} />; }
