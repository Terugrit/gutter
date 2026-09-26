export async function fetchWithRetry(fetcher: typeof fetch, input: RequestInfo | URL, init: RequestInit = {}, attempts = 3, observeResponse?: (response: Response) => boolean | void): Promise<Response> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const response = await fetcher(input, { ...init, signal: init.signal ?? AbortSignal.timeout(15000) });
    const mayRetry = observeResponse?.(response) !== false;
    if (!mayRetry && (response.status === 429 || response.status === 503)) return response;
    if (response.status !== 429 && response.status !== 503) return response;
    if (attempt === attempts - 1) return response;
    const retryAfter = response.headers.get("Retry-After");
    const seconds = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : NaN;
    const date = retryAfter && !Number.isFinite(seconds) ? Date.parse(retryAfter) - Date.now() : NaN;
    const delay = Math.min(30000, Math.max(250, Number.isFinite(seconds) ? seconds : Number.isFinite(date) ? date : 1000 * 2 ** attempt));
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error("Request retry exhausted");
}
