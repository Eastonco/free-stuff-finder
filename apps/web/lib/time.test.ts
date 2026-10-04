import { describe, expect, it } from "vitest";

import { fmtTime } from "./time";

describe("fmtTime", () => {
  it("renders in the display zone (America/Los_Angeles by default), not UTC", () => {
    // 2026-10-04T18:31Z is 11:31 AM PDT
    expect(fmtTime(new Date("2026-10-04T18:31:00Z"))).toBe("Oct 4, 11:31 AM");
  });

  it("follows DST: the same UTC clock time is an hour earlier in winter", () => {
    expect(fmtTime(new Date("2026-01-04T18:31:00Z"))).toBe("Jan 4, 10:31 AM");
  });

  it("is empty for null/undefined", () => {
    expect(fmtTime(null)).toBe("");
    expect(fmtTime(undefined)).toBe("");
  });
});
