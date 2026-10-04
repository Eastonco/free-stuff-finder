"use server";

import { CLASSIFIER_MODEL, chatText, fetchHtml, parseDetailPage } from "@fsf/engine";
import { OpenRouter } from "@openrouter/sdk";
import { OpenRouterError } from "@openrouter/sdk/models/errors";

import { getListing } from "../queries";
import { buildPrompt } from "./draft";

// Fetch the listing page and pull its description. Non-fatal: any failure
// (blocked, timeout, layout change) returns "" so drafting still proceeds.
async function fetchDescription(link: string): Promise<string> {
  try {
    return parseDetailPage(await fetchHtml(link, { timeoutMs: 8000 })).description;
  } catch {
    return "";
  }
}

// Generate a ready-to-send pickup message for one listing, using the listing
// owner's pickup phone/note. Throws on missing key or LLM failure.
export async function draftPickupMessage(listingId: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is not set on the server.");

  const data = await getListing(listingId);
  if (!data) throw new Error("Listing not found.");
  const { listing, owner } = data;

  const prompt = buildPrompt({
    name: owner?.name ?? "",
    phone: owner?.pickupPhone ?? "",
    note: owner?.pickupNote ?? "",
    title: listing.title,
    location: listing.location,
    description: await fetchDescription(listing.link),
  });

  let text: string;
  try {
    const res = await new OpenRouter({ apiKey, timeoutMs: 30_000 }).chat.send({
      chatRequest: {
        model: CLASSIFIER_MODEL,
        maxTokens: 400,
        stream: false,
        messages: [{ role: "user", content: prompt }],
      },
    });
    text = "choices" in res ? chatText(res.choices[0]?.message.content).trim() : "";
  } catch (err) {
    const status = err instanceof OpenRouterError ? ` (${err.statusCode})` : "";
    throw new Error(`AI request failed${status}. ${err instanceof Error ? err.message.slice(0, 200) : ""}`);
  }
  if (!text) throw new Error("AI returned an empty message.");
  return text;
}
