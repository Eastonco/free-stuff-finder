"use client";

import { useActionState, useState } from "react";
import type { FormState, FormValues } from "./actions";

type Props = {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: FormValues;
  submitLabel: string;
  token?: string;
};

function makeTopic() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `freestuff-${hex}`;
}

function NtfyGuide({ topic }: { topic: string }) {
  const slug = topic.trim();
  return (
    <div className="setup-guide">
      <div className="setup-guide__step">
        <span className="setup-guide__num">1</span>
        <span>
          Pick any unguessable topic name — like <em>yourname-freestuff-abc123</em>. It&apos;s just a string; anyone who
          knows it can read the topic, so keep it private.
        </span>
      </div>
      <div className="setup-guide__step">
        <span className="setup-guide__num">2</span>
        <span>
          Subscribe:{" "}
          {slug ? (
            <a href={`https://ntfy.sh/${slug}`} target="_blank" rel="noreferrer">
              ntfy.sh/{slug}
            </a>
          ) : (
            <span className="muted">enter a topic name above to get your subscribe link</span>
          )}
        </span>
      </div>
      <div className="setup-guide__step">
        <span className="setup-guide__num">3</span>
        <span>
          Get the app:{" "}
          <a href="https://ntfy.sh/" target="_blank" rel="noreferrer">
            iOS · Android · Web
          </a>{" "}
          — free, no account needed.
        </span>
      </div>
    </div>
  );
}

const TARGET_PLACEHOLDER: Record<string, string> = {
  ntfy: "yourname-freestuff-abc123",
  sms: "+12125551234",
  discord: "https://discord.com/api/webhooks/...",
};

const TARGET_LABEL: Record<string, React.ReactNode> = {
  ntfy: "Topic name",
  sms: (
    <>
      Phone number <span className="hint">E.164 format, e.g. +12125551234</span>
    </>
  ),
  discord: (
    <>
      Webhook URL{" "}
      <span className="hint">Discord channel → Settings → Integrations → Webhooks → New Webhook → Copy URL</span>
    </>
  ),
};

export default function ProfileForm({ action, defaults, submitLabel, token }: Props) {
  const [state, formAction] = useActionState(action, null);
  const v = state?.values ?? defaults;
  const [channel, setChannel] = useState(v.channel);
  const [target, setTarget] = useState(v.target);

  return (
    <form action={formAction}>
      {state?.errors?.length ? (
        <div className="err">
          {state.errors.map((e, i) => (
            <div key={i}>{e}</div>
          ))}
        </div>
      ) : null}

      {token ? <input type="hidden" name="token" value={token} /> : null}

      <label>Your name</label>
      <input name="name" defaultValue={v.name} placeholder="John Doe" />

      <label>Notify me via</label>
      <select name="channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
        <option value="ntfy">ntfy — free push notifications</option>
        <option value="sms">SMS (text message)</option>
        <option value="discord">Discord (webhook)</option>
      </select>

      <label>{TARGET_LABEL[channel]}</label>
      <div className="target-row">
        <input
          name="target"
          value={target}
          placeholder={TARGET_PLACEHOLDER[channel]}
          onChange={(e) => setTarget(e.target.value)}
        />
        {channel === "ntfy" && (
          <button type="button" className="btn-ghost" onClick={() => setTarget(makeTopic())}>
            Generate
          </button>
        )}
      </div>

      {channel === "ntfy" && <NtfyGuide topic={target} />}

      <label>
        Search URLs{" "}
        <span className="hint">one per line, from the source site's FREE section after you set your area/radius</span>
      </label>
      <textarea
        name="urls"
        defaultValue={v.urls}
        placeholder={
          "https://seattle.craigslist.org/search/zip?purveyor=owner\nhttps://seattle.craigslist.org/search/fua"
        }
      />

      <label>
        What are you looking for? <span className="hint">plain English — the AI judges each item against this</span>
      </label>
      <textarea
        name="prompt"
        defaultValue={v.prompt}
        placeholder="Furniture in good condition — especially mid-century modern, shelves, or anything useful for a home office. No particle board."
      />

      <label>
        Never alert me about <span className="hint">comma-separated words to hard-skip (optional)</span>
      </label>
      <input name="filters" defaultValue={v.filters} placeholder="broken, parts, gravel" />

      <label>
        Pickup phone{" "}
        <span className="hint">
          optional — the &quot;GET&quot; button tells sellers to text you here (E.164, e.g. +14155551234)
        </span>
      </label>
      <input name="pickupPhone" defaultValue={v.pickupPhone} placeholder="+14155551234" />

      <label>
        Note for sellers{" "}
        <span className="hint">
          optional — woven into the message, e.g. &quot;flexible on timing, have a truck&quot;
        </span>
      </label>
      <textarea
        name="pickupNote"
        defaultValue={v.pickupNote}
        placeholder="I'm flexible on timing and have a truck for big items."
      />

      <button type="submit">{submitLabel}</button>
    </form>
  );
}
