import { getReadingShelf } from "@/lib/services/reading-shelf";
import { getReleaseShelf } from "@/lib/services/coming-soon";
import { ShelfClient } from "./shelf-client";

export default async function ShelfPage() {
  const [initial, releases] = await Promise.all([getReadingShelf(), getReleaseShelf()]);
  return <ShelfClient initial={initial} initialReleases={releases} />;
}
