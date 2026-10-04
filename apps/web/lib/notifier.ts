import { type Alert, createNotifier, type NotifyTarget, type SendResult } from "@fsf/engine";

// Same channels the worker alerts on; configured from the same env vars.
const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
const token = process.env.TWILIO_AUTH_TOKEN?.trim();
const from = process.env.TWILIO_FROM?.trim();

const send = createNotifier({
  ntfyServer: process.env.NTFY_SERVER || undefined,
  twilio: sid && token && from && !from.includes("X") ? { accountSid: sid, authToken: token, from } : null,
});

/**
 * Send one message to a user's notification channel. With AUTH_DEV_LOG_LINKS=1
 * (local dev only) it's printed instead, so testing never pings real people.
 */
export async function notifyUser(target: NotifyTarget, alert: Alert): Promise<SendResult> {
  if (process.env.AUTH_DEV_LOG_LINKS === "1" && process.env.NODE_ENV !== "production") {
    console.log(`[dev notify → ${target.channel}:${target.target}] ${alert.title} — ${alert.reason} ${alert.link}`);
    return { ok: true };
  }
  return send(target, alert);
}
