import Link from "next/link";
import { getSeriesDetail } from "@/lib/services/series";
import { SeriesView } from "./series-client";

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const series = await getSeriesDetail(decodeURIComponent((await params).id));
  if (!series) return <div className="page"><h1 className="title">Nothing to follow yet.</h1><Link href="/library">Browse your library</Link></div>;
  return <SeriesView series={series} />;
}

