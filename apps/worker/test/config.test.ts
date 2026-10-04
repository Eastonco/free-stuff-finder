import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("defaults to the anthropic classifier and requires its key", () => {
    expect(loadConfig({ ANTHROPIC_API_KEY: "sk-ant" }).CLASSIFIER).toBe("anthropic");
    expect(() => loadConfig({})).toThrow(/ANTHROPIC_API_KEY is required/);
  });

  it("openrouter needs only the OpenRouter key", () => {
    const c = loadConfig({ CLASSIFIER: "openrouter", OPENROUTER_API_KEY: "sk-or" });
    expect(c.CLASSIFIER).toBe("openrouter");
    expect(c.OPENROUTER_WANT_THRESHOLD).toBe(0.5);
    expect(() => loadConfig({ CLASSIFIER: "openrouter", ANTHROPIC_API_KEY: "sk-ant" })).toThrow(
      /OPENROUTER_API_KEY is required/,
    );
  });

  it("treats the .env.example Twilio placeholder as unconfigured", () => {
    expect(
      loadConfig({
        ANTHROPIC_API_KEY: "k",
        TWILIO_ACCOUNT_SID: "a",
        TWILIO_AUTH_TOKEN: "b",
        TWILIO_FROM: "+1XXXXXXXXXX",
      }).twilio,
    ).toBeNull();
  });
});
