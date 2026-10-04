import { describe, expect, it } from "vitest";

import { buildPrompt, prettyPhone } from "./draft";

describe("prettyPhone", () => {
  it("drops +1 and formats US numbers", () => {
    expect(prettyPhone("+12069531234")).toBe("(206)-953-1234");
    expect(prettyPhone("2069531234")).toBe("(206)-953-1234");
  });

  it("leaves non-US numbers untouched", () => {
    expect(prettyPhone("+447911123456")).toBe("+447911123456");
  });
});

describe("buildPrompt", () => {
  it("includes the key fields when present", () => {
    const full = buildPrompt({
      name: "Jo",
      phone: "+14155551234",
      note: "have a truck",
      title: "Free oak desk",
      location: "Ballard",
      description: "Solid oak, some scratches.",
    });
    expect(full).toMatch(/Free oak desk/);
    expect(full).toMatch(/\(415\)-555-1234/);
    expect(full).not.toMatch(/\+1/);
    expect(full).toMatch(/have a truck/);
    expect(full).toMatch(/Solid oak/);
    expect(full).toMatch(/pick it up today/);
  });

  it("omits the phone line cleanly when there's no phone or description", () => {
    const bare = buildPrompt({ name: "Jo", phone: "", note: "", title: "Free chair", location: "", description: "" });
    expect(bare).not.toMatch(/text me at/i);
    expect(bare).toMatch(/no phone number to share/);
    expect(bare).toMatch(/no description available/);
  });
});
