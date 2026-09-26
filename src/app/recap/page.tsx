import { ReadingRecapPage } from "@/components/reading-recap";
import { getReadingRecap } from "@/lib/services/recap";
export default async function RecapPage() { return <ReadingRecapPage recap={await getReadingRecap()} />; }
