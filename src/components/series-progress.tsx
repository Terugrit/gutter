import type { SeriesProgress as Progress } from "@/lib/services/series-progress";

export function SeriesProgress({ progress }: { progress: Progress }) {
  const { owned, released, state } = progress;
  return <div className="series-progress">
    <div className="series-progress-label"><span>{released ? `${owned} / ${released} issues owned` : "No released issues yet"}</span><span>{state === "complete" ? "Complete" : state === "up-to-date" ? "Up to date" : ""}</span></div>
    <div className="progress-track" role="progressbar" aria-label="Collection progress" aria-valuemin={0} aria-valuemax={released || 1} aria-valuenow={owned} aria-valuetext={`${owned} of ${released} released issues owned`}><span style={{ width: `${released ? owned / released * 100 : 0}%` }} /></div>
  </div>;
}
