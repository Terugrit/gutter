let tail = Promise.resolve();
let lastStartedAt = 0;
let rateLimitResetAt = 0;

/** Metron sends account-specific burst and daily limits with each response. */
export function observeRateLimitHeaders(headers: Headers): boolean {
  let exhausted = false;
  for (const window of ["Burst", "Sustained"]) {
    const remainingHeader = headers.get(`X-RateLimit-${window}-Remaining`);
    if (remainingHeader === null) continue;
    const remaining = Number(remainingHeader);
    if (!Number.isFinite(remaining) || remaining > 0) continue;
    exhausted = true;
    const reset = Number(headers.get(`X-RateLimit-${window}-Reset`));
    const resetAt = Number.isFinite(reset) && reset > 0 ? reset * 1000 + 1000 : Date.now() + 60_000;
    rateLimitResetAt = Math.max(rateLimitResetAt, resetAt);
  }
  return exhausted;
}

/** Shared serial queue for rate-limited third-party metadata services. */
export function enqueueRateLimited<T>(work: () => Promise<T>, minimumIntervalMs = 250): Promise<T> {
  const run = async () => {
    const delay = Math.max(0, lastStartedAt + minimumIntervalMs - Date.now(), rateLimitResetAt - Date.now());
    if (delay > 30_000) throw new Error("Metadata API rate limit exhausted; retry later");
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    lastStartedAt = Date.now();
    return work();
  };
  const result = tail.then(run, run);
  tail = result.then(() => undefined, () => undefined);
  return result;
}
