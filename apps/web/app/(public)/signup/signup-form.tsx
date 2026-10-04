"use client";

import { Button, Card, Flex, Heading, Separator, Text, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { useActionState } from "react";

import { Field, FormErrors } from "@/components/field";
import { NotifyFields } from "@/components/notify-fields";
import { SearchFields } from "@/components/search-form";
import type { FormResult } from "@/lib/form";

import { type SignUpValues, signUp } from "./actions";

const EMPTY: SignUpValues = { invite: "", name: "", channel: "ntfy", target: "", prompt: "", urls: "", filters: "" };

export function SignUpForm() {
  const [state, action, pending] = useActionState<FormResult<SignUpValues>, FormData>(signUp, null);
  const v = state?.values ?? EMPTY;

  return (
    <Card size="3">
      <form action={action} key={JSON.stringify(v)}>
        <Flex direction="column" gap="4">
          <Heading size="4">Create an account</Heading>

          <Field label="Invite code">
            <TextField.Root name="invite" defaultValue={v.invite} autoComplete="off" />
          </Field>
          <Field label="Your name">
            <TextField.Root name="name" defaultValue={v.name} placeholder="Jo" />
          </Field>
          <NotifyFields channel={v.channel} target={v.target} />

          <Separator size="4" />
          <Text weight="medium">Your first search</Text>
          <SearchFields v={{ prompt: v.prompt, urls: v.urls, filters: v.filters, active: true }} />

          <FormErrors errors={state?.errors} />
          <Button type="submit" size="3" loading={pending}>
            Create account
          </Button>
          <Text size="2" color="gray">
            Already have one? <Link href="/signin">Sign in</Link>
          </Text>
        </Flex>
      </form>
    </Card>
  );
}
