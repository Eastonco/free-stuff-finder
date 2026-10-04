import { z } from "zod";

const bool = z
  .string()
  .optional()
  .transform((v) => ["1", "true", "yes", "on"].includes((v ?? "").trim().toLowerCase()));

const Env = z
  .object({
    /** Which model answers "does this item match?": Claude Haiku (default) or jev via OpenRouter. */
    CLASSIFIER: z.enum(["anthropic", "openrouter"]).default("anthropic"),
    ANTHROPIC_API_KEY: z.string().trim().optional(),
    OPENROUTER_API_KEY: z.string().trim().optional(),
    OPENROUTER_MODEL: z.string().trim().optional(),
    /** jev returns a probability; at or above this it's a 'want'. */
    OPENROUTER_WANT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
    /** Shadow mode: classify and record everything, but send nothing. */
    NOTIFY_DRY_RUN: bool,
    NTFY_SERVER: z.url().default("https://ntfy.sh"),
    TWILIO_ACCOUNT_SID: z.string().optional(),
    TWILIO_AUTH_TOKEN: z.string().optional(),
    TWILIO_FROM: z.string().optional(),
    SCRAPER_USER_AGENT: z.string().optional(),
    SCRAPE_INTERVAL_SECONDS: z.coerce.number().int().min(30).default(90),
    HOST_MIN_INTERVAL_MS: z.coerce.number().int().min(0).default(1500),
    SCRAPE_CONCURRENCY: z.coerce.number().int().min(1).default(2),
    MATCH_CONCURRENCY: z.coerce.number().int().min(1).default(4),
    FAIL_OPEN_WINDOW_MINUTES: z.coerce.number().positive().default(30),
    FAIL_OPEN_THRESHOLD: z.coerce.number().int().min(1).default(5),
  })
  // The selected classifier's key is mandatory: without it every item would fail open and alert.
  .superRefine((c, ctx) => {
    const key = c.CLASSIFIER === "openrouter" ? "OPENROUTER_API_KEY" : "ANTHROPIC_API_KEY";
    if (!c[key])
      ctx.addIssue({ code: "custom", path: [key], message: `${key} is required when CLASSIFIER=${c.CLASSIFIER}` });
  });

export type Config = z.infer<typeof Env> & {
  twilio: { accountSid: string; authToken: string; from: string } | null;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = Env.safeParse(env);
  if (!parsed.success) {
    throw new Error(`invalid worker config:\n${z.prettifyError(parsed.error)}`);
  }
  const c = parsed.data;
  const sid = c.TWILIO_ACCOUNT_SID?.trim();
  const token = c.TWILIO_AUTH_TOKEN?.trim();
  const from = c.TWILIO_FROM?.trim();
  // .env.example ships a placeholder FROM; only treat Twilio as configured when it's real.
  const twilio = sid && token && from && !from.includes("X") ? { accountSid: sid, authToken: token, from } : null;
  return { ...c, twilio };
}
