// Sliding-window failure counter. The worker records each fail-open
// classification; once `threshold` land inside `windowMs`, fail-open verdicts
// stop producing alerts (they're still stored) until the window drains.
// ponytail: in-memory, per worker process. Fine for one box; the counts are
// also mirrored to worker_status so the dashboard can show them.
export function createFailureWindow(opts: { windowMs: number; threshold: number; now?: () => number }) {
  const { windowMs, threshold, now = Date.now } = opts;
  const times: number[] = [];

  const prune = () => {
    const cutoff = now() - windowMs;
    while (times.length && (times[0] ?? 0) <= cutoff) times.shift();
  };

  return {
    record() {
      times.push(now());
      prune();
    },
    count() {
      prune();
      return times.length;
    },
    tripped() {
      prune();
      return times.length >= threshold;
    },
  };
}

export type FailureWindow = ReturnType<typeof createFailureWindow>;
