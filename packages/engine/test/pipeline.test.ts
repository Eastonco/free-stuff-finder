import { describe, expect, it, vi } from "vitest";

import { createFailureWindow } from "../src/failures";
import { createHostThrottle, fetchHtml, HttpError } from "../src/http";
import { decideMatch } from "../src/match";
import type { Verdict } from "../src/types";

const want: Verdict = { label: "want", score: 90, reason: "match" };
const failOpen: Verdict = { label: "want", score: 0, reason: "unavailable", error: { kind: "X", retryable: false } };
const search = { isBaseline: false, excludeFilters: ["mattress"] };

describe("decideMatch", () => {
  it("records a baseline without classifying", async () => {
    const classify = vi.fn(async () => want);
    expect(
      await decideMatch({ title: "t", search: { ...search, isBaseline: true }, classify, allowFailOpenAlerts: true }),
    ).toEqual({
      kind: "baseline",
    });
    expect(classify).not.toHaveBeenCalled();
  });

  it("skips excluded titles without classifying", async () => {
    const classify = vi.fn(async () => want);
    const d = await decideMatch({ title: "Free mattress", search, classify, allowFailOpenAlerts: true });
    expect(d).toMatchObject({ kind: "excluded", verdict: { label: "skip", reason: "excluded by filter" } });
    expect(classify).not.toHaveBeenCalled();
  });

  it("alerts on want, and on fail-open only while allowed", async () => {
    expect(
      await decideMatch({ title: "t", search, classify: async () => want, allowFailOpenAlerts: false }),
    ).toMatchObject({
      alert: true,
    });
    expect(
      await decideMatch({ title: "t", search, classify: async () => failOpen, allowFailOpenAlerts: true }),
    ).toMatchObject({
      alert: true,
    });
    expect(
      await decideMatch({ title: "t", search, classify: async () => failOpen, allowFailOpenAlerts: false }),
    ).toMatchObject({
      kind: "classified",
      alert: false,
    });
  });
});

describe("createFailureWindow", () => {
  it("trips at the threshold and recovers as the window slides", () => {
    let t = 0;
    const w = createFailureWindow({ windowMs: 1000, threshold: 3, now: () => t });
    w.record();
    w.record();
    expect(w.tripped()).toBe(false);
    w.record();
    expect(w.tripped()).toBe(true);
    t = 1001;
    expect(w.count()).toBe(0);
    expect(w.tripped()).toBe(false);
  });
});

describe("createHostThrottle", () => {
  it("spaces same-host requests and leaves other hosts alone", async () => {
    let t = 0;
    const waits: number[] = [];
    const throttle = createHostThrottle(500, {
      now: () => t,
      sleep: async (ms) => {
        waits.push(ms);
      },
    });
    await throttle("https://a.example/1");
    await throttle("https://a.example/2");
    await throttle("https://b.example/1");
    t = 200;
    await throttle("https://a.example/3");
    expect(waits).toEqual([500, 800]);
  });
});

describe("fetchHtml", () => {
  it("returns the body on 2xx and throws HttpError otherwise", async () => {
    const ok = async () => new Response("<html/>", { status: 200 });
    expect(await fetchHtml("https://x", { fetchImpl: ok })).toBe("<html/>");

    const blocked = async () => new Response("", { status: 403 });
    const err = await fetchHtml("https://x", { fetchImpl: blocked }).catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect(err.retryable).toBe(false);
    expect(new HttpError("u", 503).retryable).toBe(true);
  });
});
