"use client";

import { Button, Flex, Text } from "@radix-ui/themes";
import { useState, useTransition } from "react";

import { sendTestNotification } from "@/app/(app)/actions";

export function TestAlertButton() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  return (
    <Flex align="center" gap="3" wrap="wrap">
      <Button
        variant="soft"
        loading={pending}
        onClick={() => start(async () => setResult(await sendTestNotification()))}
      >
        Send a test alert
      </Button>
      {result ? (
        <Text size="2" color={result.ok ? "green" : "red"}>
          {result.ok ? "Sent — check your alerts." : `Couldn't send: ${result.error}`}
        </Text>
      ) : null}
    </Flex>
  );
}
