import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  isCraigslistUrl,
  normalizeSearchUrl,
  parseDetailPage,
  parseSearchPage,
  postIdFromLink,
} from "../src/sources/craigslist";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

describe("parseSearchPage", () => {
  const posts = parseSearchPage(fixture("search.html"));

  it("reads every static result, decoding entities and trimming whitespace", () => {
    expect(posts[0]).toEqual({
      sourceId: "dTKcozEFjkmRcaFryKNcxC",
      link: "https://www.craigslist.org/view/d/seattle-free-washing-machine/dTKcozEFjkmRcaFryKNcxC",
      title: "Free washing machine & brass bed frame",
      location: "Frelard",
    });
  });

  it("dedupes repeated posts, skips malformed cards, and tolerates a missing location", () => {
    expect(posts.map((p) => p.sourceId)).toEqual(["dTKcozEFjkmRcaFryKNcxC", "wFnzg57en6u4G3nx8n4c6j", "7977603870"]);
    expect(posts[1]?.location).toBeNull();
  });

  it("returns nothing for a page with no static results (layout change or block page)", () => {
    expect(parseSearchPage("<html><body>Access denied</body></html>")).toEqual([]);
  });
});

describe("parseDetailPage", () => {
  const detail = parseDetailPage(fixture("detail.html"));

  it("pulls the og:image and the exact posted time", () => {
    expect(detail.imageUrl).toBe("https://images.craigslist.org/00J0J_exampleImage_600x450.jpg");
    expect(detail.postedAt?.toISOString()).toBe("2026-10-03T23:56:14.000Z");
  });

  it("cleans the description: no QR boilerplate, <br> as newlines, collapsed blank lines", () => {
    expect(detail.description).toBe(
      "The washing machine works fine & we upgraded.\nThe queen size bed frame is free too.\n\nThey are in the driveway. First come, first served.",
    );
  });

  it("degrades to empties on an unexpected page", () => {
    expect(parseDetailPage("<html></html>")).toEqual({ imageUrl: null, description: "", postedAt: null });
  });
});

describe("url helpers", () => {
  it("postIdFromLink matches the Python scraper's cl_id", () => {
    expect(postIdFromLink("https://www.craigslist.org/view/d/x/abc123")).toBe("abc123");
    expect(postIdFromLink("https://seattle.craigslist.org/est/zip/d/x/7977603870.html")).toBe("7977603870");
    expect(postIdFromLink("not a url")).toBeNull();
  });

  it("normalizeSearchUrl drops the client-side fragment", () => {
    expect(normalizeSearchUrl(" https://seattle.craigslist.org/search/zip?lat=1#search=2~gallery~0 ")).toBe(
      "https://seattle.craigslist.org/search/zip?lat=1",
    );
  });

  it("isCraigslistUrl accepts craigslist hosts only", () => {
    expect(isCraigslistUrl("https://seattle.craigslist.org/search/zip")).toBe(true);
    expect(isCraigslistUrl("https://craigslist.org/")).toBe(true);
    expect(isCraigslistUrl("https://craigslist.org.evil.com/")).toBe(false);
    expect(isCraigslistUrl("ftp://seattle.craigslist.org/")).toBe(false);
    expect(isCraigslistUrl("nope")).toBe(false);
  });
});
