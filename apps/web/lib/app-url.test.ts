import { afterEach, describe, expect, it, vi } from "vitest";

const headers = vi.hoisted(() => ({ map: {} as Record<string, string> }));
vi.mock("next/headers", () => ({ headers: async () => ({ get: (k: string) => headers.map[k] ?? null }) }));

import { appUrl } from "./app-url";

describe("appUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    headers.map = {};
  });

  it("prefers APP_URL, trimming whitespace and trailing slashes", async () => {
    vi.stubEnv("APP_URL", " https://cl.example.com// ");
    expect(await appUrl()).toBe("https://cl.example.com");
  });

  it("ignores a spoofed Host header whenever APP_URL is set", async () => {
    vi.stubEnv("APP_URL", "https://cl.example.com");
    headers.map = { host: "evil.example", "x-forwarded-proto": "https" };
    expect(await appUrl()).toBe("https://cl.example.com");
  });

  it("refuses to guess in production", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(appUrl()).rejects.toThrow("APP_URL is not set");
  });

  it("falls back to the request host in development", async () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NODE_ENV", "development");
    headers.map = { host: "localhost:3000", "x-forwarded-proto": "https" };
    expect(await appUrl()).toBe("https://localhost:3000");
    headers.map = {};
    expect(await appUrl()).toBe("http://localhost:8000");
  });
});
