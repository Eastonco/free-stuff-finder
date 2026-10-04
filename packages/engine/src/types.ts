export const NOTIFY_CHANNELS = ["ntfy", "sms", "discord"] as const;
export type NotifyChannel = (typeof NOTIFY_CHANNELS)[number];

/** One result row from a source's search page. */
export type ListedPost = {
  /** The source's own stable id for the post (Craigslist: last path segment). */
  sourceId: string;
  link: string;
  title: string;
  location: string | null;
};

/** What we can only learn from a post's own page. */
export type PostDetail = {
  imageUrl: string | null;
  description: string;
  postedAt: Date | null;
};

export type Verdict = {
  label: "want" | "skip";
  score: number; // 0-100 confidence it matches
  reason: string;
  /** Set when classification failed and this verdict is the fail-open default. */
  error?: { kind: string; retryable: boolean };
};
