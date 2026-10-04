"""Send a matched listing to a user via their chosen channel.

ntfy (default): free push, no account needed — the user just subscribes to a
topic in the ntfy app. We use ntfy's JSON publishing endpoint (not headers)
because listing titles carry unicode/emoji and ntfy headers must be ASCII.

sms: the original Twilio path, kept as an option.

# ponytail: public ntfy topics are world-readable — recommend friends use an
# unguessable topic name. Self-hosted ntfy (set NTFY_SERVER) is the upgrade
# path if that's not good enough.
"""
import os

import requests

from .prettyprint import printError, printInfo

NTFY_SERVER = os.getenv("NTFY_SERVER", "https://ntfy.sh")


def build_ntfy_payload(topic, title, message, link=None, image_url=None) -> dict:
    payload = {"topic": topic, "title": title, "message": message}
    if link:
        payload["click"] = link
    if image_url:
        payload["attach"] = image_url
    return payload


def notify(user, title, reason, link, image_url=None):
    """Route one alert to the user's channel. user is a models.User."""
    message = f"{reason}\n{link}" if reason else link
    if user.notify_channel == "sms":
        _send_sms(user.notify_target, f"{title}\n{message}")
    elif user.notify_channel == "discord":
        _send_discord(user.notify_target, title, reason, link)
    else:
        _send_ntfy(user.notify_target, title, message, link, image_url)


def _send_discord(webhook_url, title, reason, link):
    if not webhook_url:
        printError("discord: empty webhook url, skipping")
        return
    content = f"**{title}**\n{reason}\n{link}" if reason else f"**{title}**\n{link}"
    try:
        printInfo(f"discord → webhook: {title}")
        requests.post(webhook_url, json={"content": content}, timeout=10)
    except Exception as exc:
        printError(f"discord send failed: {exc}")


def _send_ntfy(topic, title, message, link, image_url):
    if not topic:
        printError("ntfy: empty topic, skipping")
        return
    try:
        printInfo(f"ntfy → {topic}: {title}")
        requests.post(NTFY_SERVER,
                      json=build_ntfy_payload(topic, title, message, link, image_url),
                      timeout=10)
    except Exception as exc:
        printError(f"ntfy send failed: {exc}")


def _send_sms(to, body):
    from twilio.rest import Client  # lazy import: only needed for the sms channel
    sid = os.getenv("TWILIO_ACCOUNT_SID")
    token = os.getenv("TWILIO_AUTH_TOKEN")
    from_ = os.getenv("TWILIO_FROM")
    if not (sid and token and from_ and to):
        printError("sms: missing Twilio env or target, skipping")
        return
    try:
        printInfo(f"sms → {to}")
        Client(sid, token).messages.create(body=body, from_=from_, to=to)
    except Exception as exc:
        printError(f"sms send failed: {exc}")


def _demo():
    p = build_ntfy_payload("my-topic", "Free couch", "looks comfy\nhttp://x",
                           link="http://x", image_url="http://img.jpg")
    assert p["topic"] == "my-topic"
    assert p["click"] == "http://x"
    assert p["attach"] == "http://img.jpg"
    # no link/image → those keys absent
    p2 = build_ntfy_payload("t", "title", "msg")
    assert "click" not in p2 and "attach" not in p2, p2
    print("notify payload ok")


if __name__ == "__main__":
    _demo()
