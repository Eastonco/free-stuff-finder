"use server";

import { getListing } from "../queries";
import { buildPrompt, extractPostingBody } from "./draft";

const MODEL = "claude-haiku-4-5-20251001";

// Fetch the CL listing page and pull its description. Non-fatal: any failure
// (blocked, timeout, layout change) returns "" so drafting still proceeds.
async function fetchDescription(link: string): Promise<string> {
  try {
    const res = await fetch(link, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    return extractPostingBody(await res.text());
  } catch {
    return "";
  }
}

// Generate a ready-to-send pickup message for one listing, using the listing
// owner's pickup phone/note. Throws on missing key or LLM failure.
export async function draftPickupMessage(listingId: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");

  const data = await getListing(listingId);
  if (!data) throw new Error("Listing not found.");
  const { listing, owner } = data;

  const description = await fetchDescription(listing.link);
  const prompt = buildPrompt({
    name: owner?.name ?? "",
    phone: owner?.pickupPhone ?? "",
    note: owner?.pickupNote ?? "",
    title: listing.title,
    location: listing.location,
    description,
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI request failed (${res.status}). ${detail.slice(0, 200)}`);
  }
  const json = await res.json();
  const text = json?.content?.[0]?.text;
  if (typeof text !== "string" || !text.trim()) throw new Error("AI returned an empty message.");
  return text.trim();
}
