import { headers } from "next/headers";

/**
 * Public base URL for links we send out (sign-in links). In production this
 * must come from APP_URL: trusting the request's Host header would let anyone
 * mint a sign-in link pointing at their own domain.
 */
export async function appUrl(): Promise<string> {
  const configured = process.env.APP_URL?.trim().replace(/\/+$/, "");
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("APP_URL is not set (e.g. APP_URL=https://cl.example.com)");
  }
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host") ?? "localhost:8000"}`;
}
