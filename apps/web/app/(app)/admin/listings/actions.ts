"use server";

import Anthropic from "@anthropic-ai/sdk";
import { CLASSIFIER_MODEL, fetchHtml, parseDetailPage } from "@fsf/engine";

import { requireAdmin } from "@/lib/auth/session";

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
  await requireAdmin();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set on the server.");

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

  let res: Anthropic.Message;
  try {
    res = await new Anthropic({ apiKey, timeout: 30_000 }).messages.create({
      model: CLASSIFIER_MODEL,
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    });
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? ` (${err.status})` : "";
    throw new Error(`AI request failed${status}. ${err instanceof Error ? err.message.slice(0, 200) : ""}`);
  }
  const text = res.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join("")
    .trim();
  if (!text) throw new Error("AI returned an empty message.");
  return text;
}
