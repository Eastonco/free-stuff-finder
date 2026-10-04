// Queue names + retry policy. retryLimit is also how a job knows it's on its
// final attempt (see Attempt).
export const QUEUES = {
  // fires every minute; enqueues due URLs. No retries — the next tick is the retry.
  schedule: { name: "schedule", options: { retryLimit: 0, expireInSeconds: 60 } },
  // a failed scrape just waits for its next scheduled slot.
  scrape: { name: "scrape-url", options: { retryLimit: 0, expireInSeconds: 120 } },
  match: {
    name: "match",
    options: { retryLimit: 3, retryDelay: 10, retryBackoff: true, retryDelayMax: 300, expireInSeconds: 180 },
  },
  notify: {
    name: "notify",
    options: { retryLimit: 5, retryDelay: 15, retryBackoff: true, retryDelayMax: 900, expireInSeconds: 60 },
  },
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES]["name"];

export type Attempt = { retryCount: number; retryLimit: number };
export const isFinalAttempt = (a: Attempt) => a.retryCount >= a.retryLimit;
