import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { CLASSIFIER_MODEL, createClassifier } from "../src/classify";

type Reply = { status: number; body: unknown };

/** The parts of a Messages request body these tests look at. */
type SentRequest = {
  model: string;
  output_config: { format: { type: string } };
  messages: { content: { type: string; text?: string; source?: unknown }[] }[];
};

const message = (text: string) => ({
  status: 200,
  body: {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: CLASSIFIER_MODEL,
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  },
});

const apiError = (status: number, type: string) => ({
  status,
  body: { type: "error", error: { type, message: `${type} for test` } },
});

/** A real SDK client whose HTTP layer replays canned replies and records request bodies. */
function fakeClient(replies: Reply[]) {
  const requests: SentRequest[] = [];
  const client = new Anthropic({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async (_url, init) => {
      requests.push(JSON.parse(String(init?.body)));
      const reply = replies.shift() ?? apiError(500, "api_error");
      return new Response(JSON.stringify(reply.body), {
        status: reply.status,
        headers: { "content-type": "application/json" },
      });
    },
  });
  return { client, requests };
}

const input = {
  title: "Free vintage road bike, 56cm",
  imageUrl: "https://images.craigslist.org/bike.jpg",
  description: "Rides great.",
  preference: "a road bike around 56cm",
};

describe("classify", () => {
  it("sends image, title, description and a JSON-schema output format", async () => {
    const { client, requests } = fakeClient([message('{"label":"want","score":91,"reason":"56cm road bike"}')]);
    const verdict = await createClassifier({ client })(input);

    expect(verdict).toEqual({ label: "want", score: 91, reason: "56cm road bike" });
    const [req] = requests;
    expect(req?.model).toBe(CLASSIFIER_MODEL);
    expect(req?.output_config.format.type).toBe("json_schema");
    const [image, text] = req?.messages[0]?.content ?? [];
    expect(image).toEqual({ type: "image", source: { type: "url", url: input.imageUrl } });
    expect(text?.text).toContain("Free item title: Free vintage road bike, 56cm");
    expect(text?.text).toContain("Rides great.");
  });

  it("clamps the score and trims the reason", async () => {
    const { client } = fakeClient([message(JSON.stringify({ label: "skip", score: 150, reason: "x".repeat(300) }))]);
    const verdict = await createClassifier({ client })(input);
    expect(verdict.score).toBe(100);
    expect(verdict.reason).toHaveLength(140);
  });

  it("retries text-only when the image is rejected", async () => {
    const { client, requests } = fakeClient([
      apiError(400, "invalid_request_error"),
      message('{"label":"skip","score":12,"reason":"kids bike"}'),
    ]);
    const verdict = await createClassifier({ client })(input);
    expect(verdict).toEqual({ label: "skip", score: 12, reason: "kids bike" });
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages[0]?.content).toHaveLength(1);
  });

  it("fails open, flagged retryable, on rate limits and server errors", async () => {
    for (const reply of [apiError(429, "rate_limit_error"), apiError(529, "overloaded_error")]) {
      const { client } = fakeClient([reply]);
      const verdict = await createClassifier({ client })(input);
      expect(verdict.label).toBe("want");
      expect(verdict.error?.retryable).toBe(true);
    }
  });

  it("fails open, not retryable, on a bad key", async () => {
    const { client } = fakeClient([apiError(401, "authentication_error")]);
    const verdict = await createClassifier({ client })({ ...input, imageUrl: null });
    expect(verdict).toMatchObject({
      label: "want",
      score: 0,
      error: { kind: "AuthenticationError", retryable: false },
    });
  });

  it("fails open when the reply doesn't match the schema", async () => {
    const { client } = fakeClient([message("not json at all")]);
    const verdict = await createClassifier({ client })({ ...input, imageUrl: null });
    expect(verdict.label).toBe("want");
    expect(verdict.error).toBeDefined();
  });
});
