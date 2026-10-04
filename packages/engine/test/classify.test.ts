import type { OpenRouter } from "@openrouter/sdk";
import { ConnectionError, OpenRouterError } from "@openrouter/sdk/models/errors";
import { describe, expect, it } from "vitest";

import { CLASSIFIER_MODEL, chatText, createClassifier } from "../src/classify";

type Send = OpenRouter["chat"]["send"];
type SentRequest = Parameters<Send>[0];

const reply = (content: unknown) => ({
  id: "r",
  object: "chat.completion",
  created: 0,
  model: "haiku",
  choices: [{ index: 0, finishReason: "stop", message: { role: "assistant", content } }],
});

const httpError = (status: number) =>
  new OpenRouterError("nope", {
    response: new Response("nope", { status }),
    request: new Request("https://openrouter.ai/api/v1/chat/completions"),
    body: "nope",
  });

/** A stub client that replays results (or throws errors) in order and records each request. */
function stub(results: unknown[]) {
  const requests: SentRequest[] = [];
  const client = {
    chat: {
      send: (async (req: SentRequest) => {
        requests.push(req);
        const next = results.shift();
        if (next instanceof Error) throw next;
        return next;
      }) as Send,
    },
  } as unknown as Pick<OpenRouter, "chat">;
  return { client, requests };
}

const input = {
  title: "Free vintage road bike, 56cm",
  imageUrl: "https://images.craigslist.org/bike.jpg",
  description: "Rides great.",
  preference: "a road bike around 56cm",
};

describe("classify (Haiku via OpenRouter)", () => {
  it("sends text + image with a JSON-schema response format and parses the verdict", async () => {
    const { client, requests } = stub([reply('{"label":"want","score":91,"reason":"56cm road bike"}')]);
    expect(await createClassifier({ client })(input)).toEqual({ label: "want", score: 91, reason: "56cm road bike" });

    const req = requests[0]!.chatRequest;
    expect(req.model).toBe(CLASSIFIER_MODEL);
    expect(req.responseFormat?.type).toBe("json_schema");
    expect(req.messages[0]).toMatchObject({ role: "system" });
    const parts = req.messages[1]!.content as { type: string; text?: string; imageUrl?: { url: string } }[];
    expect(parts[0]?.text).toContain("Free item title: Free vintage road bike, 56cm");
    expect(parts[0]?.text).toContain("Rides great.");
    expect(parts[1]).toEqual({ type: "image_url", imageUrl: { url: input.imageUrl } });
  });

  it("accepts content returned as parts and tolerates code fences", async () => {
    const { client } = stub([
      reply([{ type: "text", text: '```json\n{"label":"skip","score":12,"reason":"kids bike"}\n```' }]),
    ]);
    expect(await createClassifier({ client })(input)).toEqual({ label: "skip", score: 12, reason: "kids bike" });
  });

  it("clamps the score and trims the reason", async () => {
    const { client } = stub([reply(JSON.stringify({ label: "skip", score: 150, reason: "x".repeat(300) }))]);
    const v = await createClassifier({ client })(input);
    expect(v.score).toBe(100);
    expect(v.reason).toHaveLength(140);
  });

  it("retries text-only when the image is rejected", async () => {
    const { client, requests } = stub([httpError(400), reply('{"label":"skip","score":20,"reason":"no"}')]);
    expect((await createClassifier({ client })(input)).label).toBe("skip");
    expect(requests).toHaveLength(2);
    expect(requests[1]!.chatRequest.messages[1]!.content).toHaveLength(1);
  });

  it("fails open: retryable on 429/5xx/connection errors, not on 401 or bad output", async () => {
    for (const err of [httpError(429), httpError(503), new ConnectionError("reset")]) {
      const v = await createClassifier({ client: stub([err]).client })({ ...input, imageUrl: null });
      expect(v).toMatchObject({ label: "want", score: 0, error: { retryable: true } });
    }
    const auth = await createClassifier({ client: stub([httpError(401)]).client })(input);
    expect(auth).toMatchObject({ label: "want", error: { kind: "OpenRouterError", retryable: false } });

    const junk = await createClassifier({ client: stub([reply("not json")]).client })(input);
    expect(junk).toMatchObject({ label: "want", error: { retryable: false } });
  });
});

describe("chatText", () => {
  it("joins text parts and ignores the rest", () => {
    expect(chatText("hi")).toBe("hi");
    expect(
      chatText([
        { type: "text", text: "a" },
        { type: "text", text: "b" },
      ] as never),
    ).toBe("ab");
    expect(chatText(null)).toBe("");
  });
});
