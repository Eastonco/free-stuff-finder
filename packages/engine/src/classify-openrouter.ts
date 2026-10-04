// The same AI gate as classify.ts, answered by OpenRouter's Decisions API
// (default model: typesafe's jev). One "noul" question — a calibrated
// probability that the item matches — instead of free-form JSON.
//
// Text only: Decisions takes text/JSON `state`, so the photo isn't seen. The
// image URL is still passed along as context. Decisions returns no rationale,
// so the verdict's reason is the probability itself.
//
// Same fail-open contract as createClassifier: errors return 'want' with
// `error` set, and the worker decides about retries and alert suppression.
import type { OpenRouter } from "@openrouter/sdk";
import { HTTPClientError, OpenRouterError, RequestAbortedError } from "@openrouter/sdk/models/errors";

import type { Classifier, ClassifyInput } from "./classify";
import type { Verdict } from "./types";

export const OPENROUTER_CLASSIFIER_MODEL = "~typesafe/jev-latest";

const MATCH_QUESTION = {
  type: "noul" as const,
  // Read the request the way the person means it: broad wording ("anything useful",
  // "anything I can resell") covers whatever fits that spirit, not just listed examples.
  instructions:
    "Would this person plausibly want this free item, given what_they_want? Read their request " +
    "the way they mean it: broad phrases like 'anything useful' or 'anything I can resell' cover " +
    "any item that fits that spirit, not only the examples they list.",
  criteria: {
    true: "Fits their request, including its broad parts (useful, valuable, resellable, or something they'd like)",
    false: "Doesn't fit their request, or is junk, worthless, or unusable",
  },
};

export function createOpenRouterClassifier(opts: {
  client: Pick<OpenRouter, "alpha">;
  model?: string;
  /** Probability at or above which the item is a 'want'. */
  wantThreshold?: number;
}): Classifier {
  const { client, model = OPENROUTER_CLASSIFIER_MODEL, wantThreshold = 0.5 } = opts;

  return async function classify(input: ClassifyInput): Promise<Verdict> {
    try {
      const res = await client.alpha.decisions.create({
        decisionsRequest: { model, state: stateFor(input), questions: { match: MATCH_QUESTION } },
      });
      const answer = res.answers.match;
      if (answer?.type !== "noul" || !("noul" in answer)) throw new Error("no 'match' answer in response");
      const p = Math.min(1, Math.max(0, Number(answer.noul)));
      const score = Math.round(p * 100);
      return { label: p >= wantThreshold ? "want" : "skip", score, reason: `${score}% match (jev)` };
    } catch (err) {
      const kind = err instanceof Error ? err.constructor.name : typeof err;
      return {
        label: "want",
        score: 0,
        reason: `classification unavailable (${kind})`,
        error: { kind, retryable: isRetryable(err) },
      };
    }
  };
}

function stateFor(i: ClassifyInput) {
  return {
    what_they_want: i.preference,
    item: {
      title: i.title,
      ...(i.description ? { description: i.description } : {}),
      ...(i.imageUrl ? { image_url: i.imageUrl } : {}),
    },
  };
}

function isRetryable(err: unknown): boolean {
  if (err instanceof OpenRouterError) return err.statusCode === 408 || err.statusCode === 429 || err.statusCode >= 500;
  // connection drops and timeouts; an explicit abort is ours, not theirs
  return err instanceof HTTPClientError && !(err instanceof RequestAbortedError);
}
