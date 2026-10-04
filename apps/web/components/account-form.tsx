"use client";

import { Button, Flex, TextArea, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { useActionState } from "react";

import type { FormResult } from "@/lib/form";

import { Field, FormErrors } from "./field";
import { NotifyFields } from "./notify-fields";

export type AccountValues = {
  name: string;
  channel: string;
  target: string;
  pickupPhone: string;
  pickupNote: string;
};

export function AccountForm({
  action,
  defaults,
  userId,
  cancelHref,
}: {
  action: (prev: FormResult<AccountValues>, fd: FormData) => Promise<FormResult<AccountValues>>;
  defaults: AccountValues;
  /** Set when an admin edits someone else's account. */
  userId?: number;
  cancelHref?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? defaults;

  return (
    // key: remount with the submitted values after a failed save so nothing typed is lost
    <form action={formAction} key={JSON.stringify(v)}>
      {userId ? <input type="hidden" name="userId" value={userId} /> : null}
      <Flex direction="column" gap="4" maxWidth="520px">
        <Field label="Name">
          <TextField.Root name="name" defaultValue={v.name} placeholder="Your name" />
        </Field>
        <NotifyFields channel={v.channel} target={v.target} />
        <Field
          label="Pickup phone"
          hint="Optional. The “GET” draft tells sellers to text you here (E.164, e.g. +14155551234)."
        >
          <TextField.Root name="pickupPhone" defaultValue={v.pickupPhone} placeholder="+14155551234" />
        </Field>
        <Field label="Note for sellers" hint="Optional, woven into the pickup message.">
          <TextArea
            name="pickupNote"
            defaultValue={v.pickupNote}
            rows={2}
            placeholder="Flexible on timing, have a truck."
          />
        </Field>

        <FormErrors errors={state?.errors} />
        {state?.saved ? (
          <div role="status" style={{ color: "var(--green-11)", fontSize: "var(--font-size-2)" }}>
            Saved.
          </div>
        ) : null}

        <Flex gap="3">
          <Button type="submit" loading={pending}>
            Save
          </Button>
          {cancelHref ? (
            <Button asChild variant="soft" color="gray">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
          ) : null}
        </Flex>
      </Flex>
    </form>
  );
}
