import { describe, expect, it } from "vitest";

import { isExcluded, parseExcludeFilters } from "../src/filter";

describe("isExcluded", () => {
  it("matches whole words case-insensitively", () => {
    expect(isExcluded("Free BED frame", ["bed"])).toBe(true);
    expect(isExcluded("Free bedside table", ["bed"])).toBe(false);
    expect(isExcluded("Free sofa-bed", ["bed"])).toBe(true);
  });

  it("is Unicode-aware where JS \\b is not", () => {
    expect(isExcluded("Free café table", ["café"])).toBe(true);
    expect(isExcluded("Free cafétable", ["café"])).toBe(false);
  });

  it("treats filter text literally and ignores blanks", () => {
    expect(isExcluded("Free 1/2 cord of firewood", ["1/2"])).toBe(true);
    expect(isExcluded("Free (wood) pallets", ["(wood)"])).toBe(true);
    expect(isExcluded("anything", ["", "  "])).toBe(false);
  });

  it("matches multi-word phrases", () => {
    expect(isExcluded("Free crib mattress", ["crib mattress"])).toBe(true);
  });
});

describe("parseExcludeFilters", () => {
  it("splits on commas and drops empties", () => {
    expect(parseExcludeFilters(" dirt, gravel ,, mattress ")).toEqual(["dirt", "gravel", "mattress"]);
  });
});
