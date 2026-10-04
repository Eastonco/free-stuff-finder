// Pure helpers for the "GET" pickup-message feature. No "use server" here: a
// "use server" module may only export async functions, so the testable sync
// helpers live here and actions.ts imports them. (Description extraction is
// @fsf/engine's parseDetailPage.)

// Pretty-print a US phone for the message: drop the +1 country code and format
// as (206)-953-1234. Non-US / unexpected shapes fall back to the trimmed input.
export function prettyPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const local = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (local.length === 10) return `(${local.slice(0, 3)})-${local.slice(3, 6)}-${local.slice(6)}`;
  return raw.trim();
}

export type DraftInput = {
  name: string;
  phone: string;
  note: string;
  title: string;
  location: string;
  description: string;
};

// The user-message sent to the model. Pure + exported so it's testable without
// hitting the API. null entries are dropped; "" entries stay as blank lines.
export function buildPrompt(i: DraftInput): string {
  const lines: (string | null)[] = [
    "Write a short message to a seller who is giving away a free item, which I want to claim.",
    'Sound like a real person texting casually — NOT salesy, NOT a template, NOT AI-generated. 2-4 sentences, no formal greeting like "Dear".',
    "Use proper capitalization and punctuation (capitalize the first word of each sentence, the word I, and proper nouns) — casual in tone, but not all-lowercase.",
    "Reference something specific about the actual item so it's clearly genuine. Ask if it's still available and say I can pick it up today.",
    "",
    `My name: ${i.name || "(unknown)"}`,
    i.phone
      ? `Tell them they can text me at: ${prettyPhone(i.phone)} (use this number exactly as written)`
      : "I have no phone number to share — ask how they'd like to coordinate pickup instead.",
    i.note ? `Work this detail about me in naturally: ${i.note}` : null,
    "",
    `Item title: ${i.title}`,
    i.location ? `Location: ${i.location}` : null,
    i.description ? `Description from the post:\n${i.description}` : "(no description available — rely on the title)",
    "",
    "Output ONLY the message text, nothing else.",
  ];
  return lines.filter((l): l is string => l !== null).join("\n");
}
