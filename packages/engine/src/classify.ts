// AI gate: does this free item match what the user wants?
//
// Claude Haiku via OpenRouter's chat API: title + photo + the post's
// description. A JSON-schema response format pins the reply's shape; zod
// checks it on the way in.
//
// Fails OPEN: on any error the verdict is 'want' (with `error` set) so a
// transient hiccup never silently drops a real find — an extra notification is
// cheap, a missed free couch is not. The caller decides whether to retry
// (`error.retryable`) and whether fail-open verdicts may still alert (see
// createFailureWindow), so a dead API key can't page everyone about everything.
import type { OpenRouter } from "@openrouter/sdk";
import type { ChatContentItems } from "@openrouter/sdk/models";
import { z } from "zod";

import { errorKind, isBadRequest, isRetryableOpenRouterError } from "./openrouter-errors";
import type { Verdict } from "./types";

/** The model the app uses for classification and the pickup draft (an OpenRouter alias that tracks the latest Haiku). */
export const CLASSIFIER_MODEL = "~anthropic/claude-haiku-latest";

const SYSTEM =
  "You filter free items for one person. Given what they're looking for and a single " +
  "item (title, photo, and the poster's description when available), decide whether it " +
  "genuinely matches. Be strict — only say 'want' if it actually fits; junk, " +
  "wrong-category, and vague matches are 'skip'. score is your 0-100 confidence that it " +
  "matches; reason is under 12 words.";

const VerdictSchema = z.object({
  label: z.enum(["want", "skip"]),
  score: z.number(),
  reason: z.string(),
});

const RESPONSE_FORMAT = {
  type: "json_schema" as const,
  jsonSchema: {
    name: "verdict",
    strict: true,
    schema: {
      type: "object",
      properties: {
        label: { type: "string", enum: ["want", "skip"] },
        score: { type: "integer", description: "0-100 confidence that it matches" },
        reason: { type: "string", description: "under 12 words" },
      },
      required: ["label", "score", "reason"],
      additionalProperties: false,
    },
  },
};

export type ClassifyInput = {
  title: string;
  imageUrl?: string | null;
  description?: string | null;
  preference: string;
};

export type Classifier = (input: ClassifyInput) => Promise<Verdict>;

/** Text of the first choice, whether the provider returned a string or content parts. */
export function chatText(content: string | ChatContentItems[] | null | undefined): string {
  if (typeof content === "string") return content;
  return (content ?? []).flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");
}

export function createClassifier(opts: { client: Pick<OpenRouter, "chat">; model?: string }): Classifier {
  const { client, model = CLASSIFIER_MODEL } = opts;

  async function ask(input: ClassifyInput, withImage: boolean) {
    const content: ChatContentItems[] = [{ type: "text", text: userText(input) }];
    if (withImage && input.imageUrl) content.push({ type: "image_url", imageUrl: { url: input.imageUrl } });

    const res = await client.chat.send({
      chatRequest: {
        model,
        maxTokens: 256,
        stream: false,
        responseFormat: RESPONSE_FORMAT,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content },
        ],
      },
    });
    if (!("choices" in res)) throw new Error("unexpected streaming response");
    const text = chatText(res.choices[0]?.message.content);
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    return VerdictSchema.parse(JSON.parse(start >= 0 ? text.slice(start, end + 1) : text));
  }

  return async function classify(input) {
    try {
      let out: z.infer<typeof VerdictSchema>;
      try {
        out = await ask(input, true);
      } catch (err) {
        // A dead or unfetchable image URL is a 4xx; the text alone is still worth judging.
        if (input.imageUrl && isBadRequest(err)) out = await ask(input, false);
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
        error: { kind, retryable: isRetryableOpenRouterError(err) },
      };
    }
  };
}

function userText(i: ClassifyInput): string {
  const lines = [`What I want: ${i.preference}`, "", `Free item title: ${i.title}`];
  if (i.description) lines.push("", `Description from the post:\n${i.description}`);
  return lines.join("\n");
}
