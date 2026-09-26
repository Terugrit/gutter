import { notFound } from "next/navigation";
import { ReadingRecapPage } from "@/components/reading-recap";
import { getReadingRecap } from "@/lib/services/recap";
export default async function RecapYearPage({ params }: { params: Promise<{ year: string }> }) {
  const value = (await params).year;
  if (!/^(?:19|20)\d{2}$/.test(value)) notFound();
  return <ReadingRecapPage recap={await getReadingRecap(Number(value))} />;
}
