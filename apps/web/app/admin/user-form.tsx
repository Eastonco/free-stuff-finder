"use client";

import { Button, Callout, Flex, Select, Text, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { useActionState, useState } from "react";

import { type SaveState, updateUser } from "./actions";

const HINT: Record<string, string> = {
  ntfy: "ntfy topic — 3–64 chars: letters, numbers, _ or -",
  sms: "E.164 phone, e.g. +14155551234",
  discord: "https://discord.com/api/webhooks/… URL",
};

export function UserForm({
  userId,
  name,
  channel,
  target,
  pickupPhone,
  pickupNote,
}: {
  userId: number;
  name: string;
  channel: string;
  target: string;
  pickupPhone: string;
  pickupNote: string;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(updateUser, null);
  const [ch, setCh] = useState(channel);

  return (
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      {/* controlled value mirrored into a hidden input so it submits with the form */}
      <input type="hidden" name="channel" value={ch} />
      <Flex direction="column" gap="3" maxWidth="420px">
        <label>
          <Text as="div" size="2" weight="bold" mb="1">
            Name
          </Text>
          <TextField.Root name="name" defaultValue={name} placeholder="display name" />
        </label>

        <label>
          <Text as="div" size="2" weight="bold" mb="1">
            Channel
          </Text>
          <Select.Root value={ch} onValueChange={setCh}>
            <Select.Trigger />
            <Select.Content>
              <Select.Item value="ntfy">ntfy</Select.Item>
              <Select.Item value="sms">sms</Select.Item>
              <Select.Item value="discord">discord</Select.Item>
            </Select.Content>
          </Select.Root>
        </label>

        <label>
          <Text as="div" size="2" weight="bold" mb="1">
            Target
          </Text>
          <TextField.Root name="target" defaultValue={target} placeholder="notification target" />
          <Text as="div" size="1" color="gray" mt="1">
            {HINT[ch] ?? ""}
          </Text>
        </label>

        <label>
          <Text as="div" size="2" weight="bold" mb="1">
            Pickup phone
          </Text>
          <TextField.Root name="pickupPhone" defaultValue={pickupPhone} placeholder="+14155551234" />
          <Text as="div" size="1" color="gray" mt="1">
            optional — the &quot;GET&quot; button tells sellers to text this number (E.164)
          </Text>
        </label>

        <label>
          <Text as="div" size="2" weight="bold" mb="1">
            Note for sellers
          </Text>
          <TextField.Root name="pickupNote" defaultValue={pickupNote} placeholder="flexible on timing, have a truck" />
          <Text as="div" size="1" color="gray" mt="1">
            optional — woven into the AI pickup message
          </Text>
        </label>

        {state?.errors?.length ? (
          <Callout.Root color="red" size="1">
            <Callout.Text>{state.errors.join(" ")}</Callout.Text>
          </Callout.Root>
        ) : null}

        <Flex align="center" gap="3">
          <Button type="submit" loading={pending}>
            Save
          </Button>
          <Button asChild variant="soft" color="gray">
            <Link href={`/admin/users/${userId}`}>Cancel</Link>
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}
