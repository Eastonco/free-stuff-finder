// Trust boundary: the create/edit form is public behind one shared invite code.
// Shared by the public profile form and the admin editors. Each validator
// returns human-readable error strings (empty = valid).
import { isCraigslistUrl } from "./sources/craigslist";
import { NOTIFY_CHANNELS } from "./types";

const E164 = /^\+\d{7,15}$/;
const TOPIC_OK = /^[A-Za-z0-9_-]{3,64}$/;
const PICKUP_NOTE_MAX = 280;

export type ProfileInput = {
  name: string;
  channel: string;
  target: string;
  urls: string; // raw textarea, one per line
  prompt: string;
  pickupPhone: string; // optional; E.164 if present
  pickupNote: string; // optional free-text
};

// Optional pickup contact used by the "GET" draft button. Empty is fine.
export function validatePickup(rawPhone: string, rawNote: string): string[] {
  const phone = rawPhone.trim();
  const errors: string[] = [];
  if (phone && !E164.test(phone)) errors.push("Pickup phone must be E.164, e.g. +14155551234 (or leave it blank).");
  if (rawNote.trim().length > PICKUP_NOTE_MAX)
    errors.push(`Note for sellers must be ${PICKUP_NOTE_MAX} characters or fewer.`);
  return errors;
}

export function validateNotify(channel: string, rawTarget: string): string[] {
  const target = rawTarget.trim();
  const errors: string[] = [];
  if (!(NOTIFY_CHANNELS as readonly string[]).includes(channel)) errors.push("Channel must be ntfy, sms, or discord.");
  if (channel === "sms" && !E164.test(target)) errors.push("SMS target must be an E.164 phone, e.g. +14155551234.");
  if (channel === "ntfy" && !TOPIC_OK.test(target))
    errors.push("ntfy topic must be 3-64 chars: letters, numbers, _ or -.");
  if (channel === "discord" && !target.startsWith("https://discord.com/api/webhooks/"))
    errors.push("Discord target must be a https://discord.com/api/webhooks/... URL.");
  return errors;
}

// Returns the parsed url list so callers don't re-split.
export function validateSearch(rawUrls: string, prompt: string): { urls: string[]; errors: string[] } {
  const urls = rawUrls
    .split(/\r?\n/)
    .map((u) => u.trim())
    .filter(Boolean);
  const errors: string[] = [];

  if (urls.length === 0) errors.push("At least one search URL is required.");
  // The worker fetches these — only ever Craigslist.
  for (const u of urls) if (!isCraigslistUrl(u)) errors.push(`Not a craigslist.org URL: ${u}`);
  if (!prompt.trim()) errors.push("Tell us what you're looking for.");

  return { urls, errors };
}

export function validate(input: ProfileInput): { urls: string[]; errors: string[] } {
  const { urls, errors: searchErrors } = validateSearch(input.urls, input.prompt);
  const errors: string[] = [];
  if (!input.name.trim()) errors.push("Name is required.");
  errors.push(...validateNotify(input.channel, input.target));
  errors.push(...validatePickup(input.pickupPhone, input.pickupNote));
  errors.push(...searchErrors);
  return { urls, errors };
}
