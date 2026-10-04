import { describe, expect, it } from "vitest";

import { buildDiscordPayload, buildNtfyPayload, createNotifier } from "../src/notify";

const alert = { title: "Free couch", reason: "looks comfy", link: "http://x", imageUrl: "http://img.jpg" };

function recordingFetch(status = 200) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init?: RequestInit) => {
    calls.push({ url, init: init ?? {} });
    return new Response("nope", { status });
  };
  return { calls, fetchImpl };
}

describe("payload builders", () => {
  it("ntfy carries click + attach only when present", () => {
    expect(buildNtfyPayload("my-topic", alert)).toEqual({
      topic: "my-topic",
      title: "Free couch",
      message: "looks comfy\nhttp://x",
      click: "http://x",
      attach: "http://img.jpg",
    });
    expect(buildNtfyPayload("t", { title: "t", reason: "", link: "http://x" })).not.toHaveProperty("attach");
  });

  it("discord never pings", () => {
    expect(buildDiscordPayload({ ...alert, title: "@everyone free stuff" })).toEqual({
      content: "**@everyone free stuff**\nlooks comfy\nhttp://x",
      allowed_mentions: { parse: [] },
    });
  });
});

describe("createNotifier", () => {
  it("routes ntfy to the configured server", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const res = await createNotifier({ fetchImpl, ntfyServer: "https://ntfy.example" })(
      { channel: "ntfy", target: "topic" },
      alert,
    );
    expect(res).toEqual({ ok: true });
    expect(calls[0]?.url).toBe("https://ntfy.example");
    expect(JSON.parse(String(calls[0]?.init.body)).topic).toBe("topic");
  });

  it("posts sms through Twilio's REST API with basic auth", async () => {
    const { calls, fetchImpl } = recordingFetch(201);
    const twilio = { accountSid: "AC1", authToken: "tok", from: "+15550000000" };
    const res = await createNotifier({ fetchImpl, twilio })({ channel: "sms", target: "+15551112222" }, alert);
    expect(res.ok).toBe(true);
    expect(calls[0]?.url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json");
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Basic ${Buffer.from("AC1:tok").toString("base64")}`);
    expect(new URLSearchParams(String(calls[0]?.init.body)).get("To")).toBe("+15551112222");
  });

  it("reports failures instead of throwing, flagging what's retryable", async () => {
    const notify = (status: number) =>
      createNotifier({ fetchImpl: recordingFetch(status).fetchImpl })(
        { channel: "discord", target: "https://d" },
        alert,
      );
    expect(await notify(503)).toMatchObject({ ok: false, retryable: true });
    expect(await notify(404)).toMatchObject({ ok: false, retryable: false, error: "HTTP 404: nope" });

    const throwing = createNotifier({
      fetchImpl: async () => {
        throw new Error("ECONNRESET");
      },
    });
    expect(await throwing({ channel: "ntfy", target: "t" }, alert)).toEqual({
      ok: false,
      error: "ECONNRESET",
      retryable: true,
    });
  });

  it("refuses empty targets and unconfigured sms without calling out", async () => {
    const { calls, fetchImpl } = recordingFetch();
    const notify = createNotifier({ fetchImpl });
    expect(await notify({ channel: "ntfy", target: "" }, alert)).toMatchObject({ ok: false, retryable: false });
    expect(await notify({ channel: "sms", target: "+1555" }, alert)).toMatchObject({ ok: false, retryable: false });
    expect(calls).toHaveLength(0);
  });
});
