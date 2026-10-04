import { describe, expect, it } from "vitest";

import { isFinalAttempt, QUEUES } from "../src/queues";

describe("isFinalAttempt", () => {
  it("is true once retries are used up (and beyond)", () => {
    expect(isFinalAttempt({ retryCount: 0, retryLimit: 3 })).toBe(false);
    expect(isFinalAttempt({ retryCount: 2, retryLimit: 3 })).toBe(false);
    expect(isFinalAttempt({ retryCount: 3, retryLimit: 3 })).toBe(true);
    expect(isFinalAttempt({ retryCount: 4, retryLimit: 3 })).toBe(true);
  });

  it("makes jobs without retries always final", () => {
    expect(isFinalAttempt({ retryCount: 0, retryLimit: QUEUES.scrape.options.retryLimit })).toBe(true);
  });
});

describe("QUEUES", () => {
  it("has unique queue names", () => {
    const names = Object.values(QUEUES).map((q) => q.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("retries match and notify with backoff, but not the self-healing scheduler/scrape", () => {
    expect(QUEUES.schedule.options.retryLimit).toBe(0);
    expect(QUEUES.scrape.options.retryLimit).toBe(0);
    expect(QUEUES.match.options.retryLimit).toBeGreaterThan(0);
    expect(QUEUES.notify.options.retryLimit).toBeGreaterThan(0);
  });
});
