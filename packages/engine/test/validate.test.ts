import { describe, expect, it } from "vitest";

import { validate, validateNotify, validateSearch } from "../src/validate";

describe("validateNotify", () => {
  it("accepts each channel's target shape", () => {
    expect(validateNotify("ntfy", "my_topic-1")).toEqual([]);
    expect(validateNotify("sms", "+14155551234")).toEqual([]);
    expect(validateNotify("discord", "https://discord.com/api/webhooks/1/abc")).toEqual([]);
  });

  it("rejects bad channels and targets", () => {
    expect(validateNotify("email", "x")).toHaveLength(1);
    expect(validateNotify("sms", "4155551234")).toHaveLength(1);
    expect(validateNotify("ntfy", "a b")).toHaveLength(1);
  });
});

describe("validateSearch", () => {
  it("splits urls and only allows craigslist", () => {
    const { urls, errors } = validateSearch(
      "https://seattle.craigslist.org/search/zip\n\nhttps://evil.com\n",
      "a couch",
    );
    expect(urls).toEqual(["https://seattle.craigslist.org/search/zip", "https://evil.com"]);
    expect(errors).toEqual(["Not a craigslist.org URL: https://evil.com"]);
  });
});

describe("validate", () => {
  it("collects every error from a blank form", () => {
    const { errors } = validate({
      name: "",
      channel: "ntfy",
      target: "",
      urls: "",
      prompt: "",
      pickupPhone: "x",
      pickupNote: "",
    });
    expect(errors).toHaveLength(5);
  });
});
