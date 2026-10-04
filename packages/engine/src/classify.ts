// AI gate: does this free item match what the user wants?
//
// Title + photo + the post's description (fetched from its page). Structured
// outputs guarantee the reply shape, so there's no JSON scraping.
//
// Fails OPEN: on any error the verdict is 'want' (with `error` set) so a
// transient hiccup never silently drops a real find — an extra notification is
// cheap, a missed free couch is not. The caller decides whether to retry
// (`error.retryable`) and whether fail-open verdicts may still alert (see
// createFailureWindow), so a dead API key can't page everyone about everything.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { Verdict } from "./types";

/** The one model id the app uses for both classification and the pickup draft. */
export const CLASSIFIER_MODEL = "claude-haiku-4-5";

const SYSTEM =
  "You filter free items for one person. Given what they're looking for and a single " +
  "item (title, photo, and the poster's description when available), decide whether it " +
  "genuinely matches. Be strict — only say 'want' if it actually fits; junk, " +
  "wrong-category, and vague matches are 'skip'. score is your 0-100 confidence that it " +
  "matches; reason is under 12 words.";

const VerdictSchema = z.object({
  label: z.enum(["want", "skip"]),
  score: z.number().int(),
  reason: z.string(),
});

export type ClassifyInput = {
  title: string;
  imageUrl?: string | null;
  description?: string | null;
  preference: string;
};

export type Classifier = (input: ClassifyInput) => Promise<Verdict>;

export function createClassifier(opts: { client: Anthropic; model?: string }): Classifier {
  const { client, model = CLASSIFIER_MODEL } = opts;

  async function ask(input: ClassifyInput, withImage: boolean) {
    const content: Anthropic.ContentBlockParam[] = [];
    if (withImage && input.imageUrl) content.push({ type: "image", source: { type: "url", url: input.imageUrl } });
    content.push({ type: "text", text: userText(input) });

    const res = await client.messages.parse({
      model,
      max_tokens: 256,
      system: SYSTEM,
      messages: [{ role: "user", content }],
      output_config: { format: zodOutputFormat(VerdictSchema) },
    });
    if (!res.parsed_output) throw new UnparseableReply(res.stop_reason);
    return res.parsed_output;
  }

  return async function classify(input) {
    try {
      let out: z.infer<typeof VerdictSchema>;
      try {
        out = await ask(input, true);
      } catch (err) {
        // A dead or unfetchable image URL is a 400; the text alone is still worth judging.
        if (input.imageUrl && err instanceof Anthropic.BadRequestError) out = await ask(input, false);
        else throw err;
      }
      return {
        label: out.label,
        score: Math.min(100, Math.max(0, Math.round(out.score))),
        reason: out.reason.slice(0, 140),
      };
    } catch (err) {
      const kind = errorKind(err);
      return {
        label: "want",
        score: 0,
        reason: `classification unavailable (${kind})`,
        error: { kind, retryable: isRetryable(err) },
      };
    }
  };
}

function userText(i: ClassifyInput): string {
  const lines = [`What I want: ${i.preference}`, "", `Free item title: ${i.title}`];
  if (i.description) lines.push("", `Description from the post:\n${i.description}`);
  return lines.join("\n");
}

class UnparseableReply extends Error {
  constructor(stopReason: string | null) {
    super(`model reply did not match the verdict schema (stop_reason: ${stopReason})`);
    this.name = "UnparseableReply";
  }
}

function isRetryable(err: unknown): boolean {
  return (
    err instanceof Anthropic.RateLimitError ||
    err instanceof Anthropic.InternalServerError ||
    err instanceof Anthropic.APIConnectionError
  );
}

function errorKind(err: unknown): string {
  return err instanceof Error ? err.constructor.name : typeof err;
}
