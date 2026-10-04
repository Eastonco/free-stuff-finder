// Cheap hard-exclude before the AI: whole-word, case-insensitive, Unicode-aware
// (JS \b is ASCII-only, so word boundaries are spelled out as lookarounds).
const WORD_CHAR = "[\\p{L}\\p{N}_]";

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function isExcluded(title: string, filters: readonly string[]): boolean {
  return filters.some((raw) => {
    const word = raw.trim();
    if (!word) return false;
    return new RegExp(`(?<!${WORD_CHAR})${escapeRegExp(word)}(?!${WORD_CHAR})`, "iu").test(title);
  });
}

/** "a, b ,,c" → ["a", "b", "c"] — how the forms store exclude filters. */
export function parseExcludeFilters(raw: string): string[] {
  return raw
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);
}
