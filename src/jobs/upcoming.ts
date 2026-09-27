import { checkReleaseDates, refreshUpcomingCandidates, tuneInterestWeights } from "@/lib/services/coming-soon";
import { runTrackedJob } from "./status";

export async function refreshUpcomingReleases() {
  return runTrackedJob("refresh-upcoming-releases", () => refreshUpcomingCandidates());
}

export async function checkUpcomingReleaseDates() {
  return runTrackedJob("check-release-dates", () => checkReleaseDates());
}

export async function tuneUpcomingInterestWeights() {
  return runTrackedJob("tune-interest-weights", () => tuneInterestWeights());
}
