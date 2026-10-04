// Present as a normal desktop Firefox-on-Windows user.
// ponytail: one stable string beats per-request rotation (a single IP cycling
// UAs looks *more* botty). Bump the version when it ages out, or override via
// SCRAPER_USER_AGENT in the worker.
export const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HttpError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`GET ${url} → ${status}`);
    this.name = "HttpError";
  }

  /** 429 and 5xx are worth retrying; other 4xx (gone, blocked) are not. */
  get retryable(): boolean {
    return this.status === 429 || this.status >= 500;
  }
}

export type FetchHtmlOptions = {
  fetchImpl?: FetchLike;
  userAgent?: string;
  timeoutMs?: number;
};

export async function fetchHtml(url: string, opts: FetchHtmlOptions = {}): Promise<string> {
  const { fetchImpl = fetch, userAgent = DEFAULT_USER_AGENT, timeoutMs = 15_000 } = opts;
  const res = await fetchImpl(url, {
    headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new HttpError(url, res.status);
  return res.text();
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Spaces requests to the same host at least `minIntervalMs` apart, however many
 * jobs run concurrently. In-process only.
 * ponytail: one worker process on one box. If workers ever scale out, move the
 * slot bookkeeping into Postgres (or lean on pg-boss's per-queue rate limits).
 */
export function createHostThrottle(
  minIntervalMs: number,
  clock: { now: () => number; sleep: (ms: number) => Promise<void> } = { now: Date.now, sleep },
) {
  const nextSlot = new Map<string, number>();
  return async function waitForSlot(url: string): Promise<void> {
    const host = new URL(url).host;
    const now = clock.now();
    const at = Math.max(now, nextSlot.get(host) ?? 0);
    nextSlot.set(host, at + minIntervalMs);
    if (at > now) await clock.sleep(at - now);
  };
}
