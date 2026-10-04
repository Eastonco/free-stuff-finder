"""AI gate: does this free item match what the user wants?

One function, behind a thin seam so the model stays swappable. Free-items-only,
so there's no price to reason about — we classify on title + the gallery
thumbnail (both already scraped from the search page, no detail-page fetch).

# ponytail: title + image is enough for free stuff. If filtering proves weak,
# the upgrade path is to open each post's detail page for the description and
# add it to the prompt below — nothing else changes.
"""
import json

from anthropic import Anthropic

MODEL = "claude-haiku-4-5"

SYSTEM = (
    "You filter free items for one person. Given what they're looking "
    "for and a single item (title + photo), decide whether it genuinely matches. "
    "Be strict — only say 'want' if it actually fits; junk, wrong-category, and "
    "vague matches are 'skip'. Reply with ONLY a JSON object, no prose:\n"
    '{"label": "want" | "skip", "score": <0-100 confidence it matches>, '
    '"reason": "<under 12 words>"}'
)


def _extract_json(text: str) -> str:
    """Pull the first {...} block out, tolerating code fences or stray prose."""
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError(f"no JSON object in model reply: {text!r}")
    return text[start:end + 1]


def classify(title: str, image_url: str | None, preference_prompt: str, api_key: str) -> dict:
    """Return {'label': 'want'|'skip', 'score': int, 'reason': str}.

    Fails OPEN: any API/parse error returns 'want' so a transient hiccup never
    silently drops a real find. An extra notification is cheap; a missed free
    couch is not.
    """
    try:
        client = Anthropic(api_key=api_key)
        content: list = [{
            "type": "text",
            "text": f"What I want: {preference_prompt}\n\nFree item title: {title}",
        }]
        if image_url:
            content.insert(0, {"type": "image", "source": {"type": "url", "url": image_url}})

        msg = client.messages.create(
            model=MODEL,
            max_tokens=200,
            system=SYSTEM,
            messages=[{"role": "user", "content": content}],
        )
        data = json.loads(_extract_json(msg.content[0].text.strip()))
        label = "want" if str(data.get("label", "")).lower() == "want" else "skip"
        return {
            "label": label,
            "score": int(data.get("score", 0)),
            "reason": str(data.get("reason", ""))[:140],
        }
    except Exception as exc:
        return {"label": "want", "score": 0,
                "reason": f"classification unavailable ({type(exc).__name__})"}


def _demo():
    """Self-check. Fail-open path needs no key/network. The real match/mismatch
    pair only runs if ANTHROPIC_API_KEY is set."""
    import os

    # 1. Fail open on a bad key — must still return 'want'.
    out = classify("Free couch", None, "a comfy couch", api_key="sk-bad-key")
    assert out["label"] == "want", out
    print("fail-open ok:", out)

    key = os.getenv("ANTHROPIC_API_KEY")
    if not key:
        print("ANTHROPIC_API_KEY not set — skipping live classification check")
        return

    pref = "a vintage road bike, ~56cm frame, no kids bikes, no project bikes"
    hit = classify("Free vintage Schwinn road bike, ~56cm, rides great", None, pref, key)
    miss = classify("Free pile of dirt and gravel", None, pref, key)
    print("hit:", hit)
    print("miss:", miss)
    assert hit["label"] == "want", hit
    assert miss["label"] == "skip", miss
    print("live classification ok")


if __name__ == "__main__":
    _demo()
