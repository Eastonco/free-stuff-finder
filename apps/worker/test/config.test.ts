import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config";

describe("loadConfig", () => {
  it("requires the OpenRouter key and defaults to the haiku classifier", () => {
    expect(() => loadConfig({})).toThrow(/OPENROUTER_API_KEY is required/);
    const c = loadConfig({ OPENROUTER_API_KEY: "sk-or" });
    expect(c.CLASSIFIER).toBe("haiku");
    expect(c.JEV_WANT_THRESHOLD).toBe(0.5);
  });

  it("accepts jev and rejects unknown classifiers", () => {
    expect(loadConfig({ OPENROUTER_API_KEY: "k", CLASSIFIER: "jev" }).CLASSIFIER).toBe("jev");
    expect(() => loadConfig({ OPENROUTER_API_KEY: "k", CLASSIFIER: "anthropic" })).toThrow();
  });

  it("treats the .env.example Twilio placeholder as unconfigured", () => {
    expect(
      loadConfig({
        OPENROUTER_API_KEY: "k",
        TWILIO_ACCOUNT_SID: "a",
        TWILIO_AUTH_TOKEN: "b",
        TWILIO_FROM: "+1XXXXXXXXXX",
      }).twilio,
    ).toBeNull();
  });
});
