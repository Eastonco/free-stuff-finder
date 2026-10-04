// Send a matched listing to a user via their chosen channel.
//
// ntfy (default): free push, no account — the user subscribes to a topic in the
// ntfy app. We use ntfy's JSON publishing endpoint (not headers) because
// listing titles carry unicode/emoji and ntfy headers must be ASCII.
// ponytail: public ntfy topics are world-readable — recommend an unguessable
// topic name. Self-hosted ntfy (NTFY_SERVER) is the upgrade path.
//
// discord: a channel webhook URL. sms: Twilio's REST API (no SDK needed).
//
// Senders never throw: they return a SendResult so the worker can record the
// outcome and retry only what's worth retrying.
import type { FetchLike } from "./http";
import type { NotifyChannel } from "./types";

export type Alert = {
  title: string;
  reason: string;
  link: string;
  imageUrl?: string | null;
};

export type NotifyTarget = { channel: NotifyChannel | string; target: string };

export type SendResult = { ok: true } | { ok: false; error: string; retryable: boolean };

export type TwilioConfig = { accountSid: string; authToken: string; from: string };

export function buildNtfyPayload(topic: string, alert: Alert) {
  return {
    topic,
    title: alert.title,
    message: alert.reason ? `${alert.reason}\n${alert.link}` : alert.link,
    click: alert.link,
    ...(alert.imageUrl ? { attach: alert.imageUrl } : {}),
  };
}

export function buildDiscordPayload(alert: Alert) {
  const lines = [`**${alert.title}**`, alert.reason, alert.link].filter(Boolean);
  // never let a listing title ping @everyone / roles
  return { content: lines.join("\n"), allowed_mentions: { parse: [] as string[] } };
}

export function buildSmsBody(alert: Alert): string {
  return [alert.title, alert.reason, alert.link].filter(Boolean).join("\n");
}

export function createNotifier(
  opts: { fetchImpl?: FetchLike; ntfyServer?: string; twilio?: TwilioConfig | null; timeoutMs?: number } = {},
) {
  const { fetchImpl = fetch, ntfyServer = "https://ntfy.sh", twilio = null, timeoutMs = 10_000 } = opts;

  async function post(url: string, init: RequestInit): Promise<SendResult> {
    try {
      const res = await fetchImpl(url, { method: "POST", ...init, signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) return { ok: true };
      const detail = (await res.text().catch(() => "")).slice(0, 200);
      return {
        ok: false,
        error: `HTTP ${res.status}${detail ? `: ${detail}` : ""}`,
        retryable: res.status === 429 || res.status >= 500,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err), retryable: true };
    }
  }

  const json = (body: unknown): RequestInit => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  return async function send({ channel, target }: NotifyTarget, alert: Alert): Promise<SendResult> {
    if (!target) return { ok: false, error: `${channel}: empty target`, retryable: false };

    switch (channel) {
      case "discord":
        return post(target, json(buildDiscordPayload(alert)));
      case "sms": {
        if (!twilio) return { ok: false, error: "sms: Twilio is not configured", retryable: false };
        const auth = Buffer.from(`${twilio.accountSid}:${twilio.authToken}`).toString("base64");
        return post(`https://api.twilio.com/2010-04-01/Accounts/${twilio.accountSid}/Messages.json`, {
          headers: { authorization: `Basic ${auth}`, "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ To: target, From: twilio.from, Body: buildSmsBody(alert) }).toString(),
        });
      }
      default:
        return post(ntfyServer, json(buildNtfyPayload(target, alert)));
    }
  };
}

export type Notifier = ReturnType<typeof createNotifier>;
