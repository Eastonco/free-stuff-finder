import type { OpenRouter } from "@openrouter/sdk";
import { ConnectionError, OpenRouterError } from "@openrouter/sdk/models/errors";
import { describe, expect, it } from "vitest";

import { createOpenRouterClassifier, OPENROUTER_CLASSIFIER_MODEL } from "../src/classify-openrouter";

type Create = OpenRouter["alpha"]["decisions"]["create"];

function stub(impl: (req: Parameters<Create>[0]) => unknown) {
  const calls: Parameters<Create>[0][] = [];
  const client = {
    alpha: {
      decisions: {
        create: (async (req: Parameters<Create>[0]) => {
          calls.push(req);
          return impl(req);
        }) as Create,
      },
    },
  } as unknown as Pick<OpenRouter, "alpha">;
  return { client, calls };
}

const answer = (noul: number) => ({
  answers: { match: { type: "noul", noul } },
  model: "jev",
  usage: { inputTokens: 1, outputTokens: 1 },
});

const input = {
  title: "Free road bike",
  description: "56cm frame, rides great",
  imageUrl: "https://images.craigslist.org/bike.jpg",
  preference: "a road bike around 56cm",
};

const httpError = (status: number) =>
  new OpenRouterError("nope", {
    response: new Response("nope", { status }),
    request: new Request("https://openrouter.ai/api/v1/alpha/decisions"),
    body: "nope",
  });

describe("createOpenRouterClassifier", () => {
  it("asks one noul question with the item and preference as JSON state", async () => {
    const { client, calls } = stub(() => answer(0.82));
    const verdict = await createOpenRouterClassifier({ client })(input);

    expect(verdict).toEqual({ label: "want", score: 82, reason: "82% match (jev)" });
    const req = calls[0]!.decisionsRequest;
    expect(req.model).toBe(OPENROUTER_CLASSIFIER_MODEL);
    expect(req.state).toEqual({
      what_they_want: "a road bike around 56cm",
      item: { title: "Free road bike", description: "56cm frame, rides great", image_url: input.imageUrl },
    });
    expect(req.questions.match?.type).toBe("noul");
  });

  it("applies the want threshold", async () => {
    const low = createOpenRouterClassifier({ client: stub(() => answer(0.3)).client });
    expect((await low(input)).label).toBe("skip");
    const strict = createOpenRouterClassifier({ client: stub(() => answer(0.6)).client, wantThreshold: 0.7 });
    expect((await strict(input)).label).toBe("skip");
  });

  it("omits missing optional fields from state", async () => {
    const { client, calls } = stub(() => answer(0.1));
    await createOpenRouterClassifier({ client })({ title: "x", preference: "y", description: null, imageUrl: null });
    expect(calls[0]!.decisionsRequest.state).toEqual({ what_they_want: "y", item: { title: "x" } });
  });

  it("fails open: retryable on 429/5xx and connection errors, not on 401", async () => {
    const run = (err: unknown) =>
      createOpenRouterClassifier({
        client: stub(() => {
          throw err;
        }).client,
      })(input);

    for (const err of [httpError(429), httpError(502), new ConnectionError("reset")]) {
      expect(await run(err)).toMatchObject({ label: "want", score: 0, error: { retryable: true } });
    }
    expect(await run(httpError(401))).toMatchObject({ label: "want", error: { retryable: false } });
  });

  it("fails open when the answer is missing or the wrong type", async () => {
    const { client } = stub(() => ({ answers: { match: { type: "choice", choice: "x" } } }));
    expect((await createOpenRouterClassifier({ client })(input)).error).toBeDefined();
  });
});
