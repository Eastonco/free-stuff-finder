"use client";

import { AlertDialog, Button, Flex, Switch, Text } from "@radix-ui/themes";
import { useState, useTransition } from "react";

import { deleteSearch, setSearchActive } from "@/app/(app)/actions";

export function ActiveToggle({ searchId, active }: { searchId: number; active: boolean }) {
  const [on, setOn] = useState(active);
  const [pending, start] = useTransition();
  return (
    <Text as="label" size="2" color="gray">
      <Flex align="center" gap="2">
        <Switch
          size="1"
          checked={on}
          disabled={pending}
          onCheckedChange={(v) => {
            setOn(v);
            start(() => setSearchActive(searchId, v));
          }}
        />
        {on ? "Active" : "Paused"}
      </Flex>
    </Text>
  );
}

export function DeleteSearchButton({ searchId, returnTo }: { searchId: number; returnTo?: string }) {
  const [pending, start] = useTransition();
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger>
        <Button variant="soft" color="red" loading={pending}>
          Delete search
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Content maxWidth="420px">
        <AlertDialog.Title>Delete this search?</AlertDialog.Title>
        <AlertDialog.Description size="2">
          You&apos;ll stop getting alerts for it. Its history goes too. This can&apos;t be undone.
        </AlertDialog.Description>
        <Flex gap="3" mt="4" justify="end">
          <AlertDialog.Cancel>
            <Button variant="soft" color="gray">
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action>
            <Button color="red" onClick={() => start(() => deleteSearch(searchId, returnTo))}>
              Delete
            </Button>
          </AlertDialog.Action>
        </Flex>
      </AlertDialog.Content>
    </AlertDialog.Root>
  );
}
