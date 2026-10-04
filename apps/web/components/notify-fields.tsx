"use client";

import { Button, Flex, Link as RLink, Select, Text, TextField } from "@radix-ui/themes";
import { useState } from "react";

import { Field } from "./field";

const PLACEHOLDER: Record<string, string> = {
  ntfy: "yourname-freestuff-abc123",
  sms: "+12125551234",
  discord: "https://discord.com/api/webhooks/...",
};

const TARGET_LABEL: Record<string, string> = {
  ntfy: "ntfy topic",
  sms: "Phone number",
  discord: "Discord webhook URL",
};

const TARGET_HINT: Record<string, React.ReactNode> = {
  ntfy: "Anyone who knows the topic can read it — make it unguessable.",
  sms: "E.164 format, e.g. +12125551234",
  discord: "Channel → Settings → Integrations → Webhooks → New Webhook → Copy URL",
};

function makeTopic() {
  const hex = Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");
  return `freestuff-${hex}`;
}

/** Channel picker + target, shared by sign-up, account settings and the admin user editor. */
export function NotifyFields({ channel: initialChannel, target: initialTarget }: { channel: string; target: string }) {
  const [channel, setChannel] = useState(initialChannel || "ntfy");
  const [target, setTarget] = useState(initialTarget);
  const topic = target.trim();

  return (
    <Flex direction="column" gap="3">
      <input type="hidden" name="channel" value={channel} />
      <Field label="Send alerts to">
        <Select.Root value={channel} onValueChange={setChannel}>
          <Select.Trigger style={{ width: "100%" }} />
          <Select.Content>
            <Select.Item value="ntfy">ntfy — free push notifications</Select.Item>
            <Select.Item value="sms">SMS</Select.Item>
            <Select.Item value="discord">Discord webhook</Select.Item>
          </Select.Content>
        </Select.Root>
      </Field>

      <Field label={TARGET_LABEL[channel] ?? "Target"} hint={TARGET_HINT[channel]}>
        <Flex gap="2">
          <TextField.Root
            name="target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={PLACEHOLDER[channel]}
            style={{ flex: 1 }}
            autoComplete="off"
          />
          {channel === "ntfy" ? (
            <Button type="button" variant="soft" onClick={() => setTarget(makeTopic())}>
              Generate
            </Button>
          ) : null}
        </Flex>
      </Field>

      {channel === "ntfy" ? (
        <Text size="1" color="gray">
          Get the free{" "}
          <RLink href="https://ntfy.sh/" target="_blank" rel="noreferrer">
            ntfy app
          </RLink>{" "}
          and subscribe to{" "}
          {topic ? (
            <RLink href={`https://ntfy.sh/${encodeURIComponent(topic)}`} target="_blank" rel="noreferrer">
              {topic}
            </RLink>
          ) : (
            "your topic"
          )}
          . Sign-in links arrive here too.
        </Text>
      ) : null}
    </Flex>
  );
}
