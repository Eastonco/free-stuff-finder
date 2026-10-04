"use client";

import { Button, Callout, Card, Flex, Heading, Link as RLink, Text, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { useActionState } from "react";

import { Field } from "@/components/field";

import { requestSignInLink, type SignInState } from "./actions";

export function SignInForm({ expired }: { expired: boolean }) {
  const [state, action, pending] = useActionState<SignInState, FormData>(requestSignInLink, null);

  if (state?.sent) {
    return (
      <Card size="3">
        <Flex direction="column" gap="3">
          <Heading size="4">Check your alerts</Heading>
          <Text>
            If <Text weight="bold">{state.target}</Text> belongs to an account, a sign-in link is on its way there — the
            same place your free-stuff alerts arrive. It works once and expires in 15 minutes.
          </Text>
          <Text size="2" color="gray">
            Nothing after a minute? Check the destination for typos and <RLink href="/signin">try again</RLink>.
          </Text>
        </Flex>
      </Card>
    );
  }

  return (
    <Card size="3">
      <form action={action}>
        <Flex direction="column" gap="4">
          <Heading size="4">Sign in</Heading>
          {expired ? (
            <Callout.Root color="amber" size="1">
              <Callout.Text>That sign-in link has expired or was already used. Request a new one.</Callout.Text>
            </Callout.Root>
          ) : null}
          <Field
            label="Where do your alerts go?"
            hint="Your ntfy topic, phone number, or Discord webhook URL. We'll send a sign-in link there."
          >
            <TextField.Root
              name="target"
              size="3"
              defaultValue={state?.target}
              placeholder="freestuff-1a2b3c4d"
              autoComplete="username"
              autoFocus
            />
          </Field>
          {state?.error ? (
            <Text size="2" color="red">
              {state.error}
            </Text>
          ) : null}
          <Button type="submit" size="3" loading={pending}>
            Send me a sign-in link
          </Button>
          <Text size="2" color="gray">
            New here? <Link href="/signup">Create an account</Link>
          </Text>
        </Flex>
      </form>
    </Card>
  );
}
