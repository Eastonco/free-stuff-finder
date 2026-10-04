"use client";

import { Button, Callout, Flex, Switch, Text, TextArea, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { useActionState, useState } from "react";

import { type SaveState, updateSearch } from "./actions";

export function SearchForm({
  searchId,
  urls,
  prompt,
  excludeFilters,
  active,
}: {
  searchId: number;
  urls: string[];
  prompt: string;
  excludeFilters: string[];
  active: boolean;
}) {
  const [state, action, pending] = useActionState<SaveState, FormData>(updateSearch, null);
  const [on, setOn] = useState(active);

  return (
    <form action={action}>
      <input type="hidden" name="searchId" value={searchId} />
      {/* Switch isn't a form control; mirror its state into a hidden input ("on"/absent). */}
      {on ? <input type="hidden" name="active" value="on" /> : null}
      <Flex direction="column" gap="3" maxWidth="640px">
        <label>
          <Text as="div" size="2" weight="bold" mb="1">
            Wishlist
          </Text>
          <TextArea name="prompt" defaultValue={prompt} rows={3} />
        </label>

        <label>
          <Text as="div" size="2" weight="bold" mb="1">
            Search URLs (one per line)
          </Text>
          <TextArea name="urls" defaultValue={urls.join("\n")} rows={3} />
        </label>

        <label>
          <Text as="div" size="2" weight="bold" mb="1">
            Excludes (comma-separated)
          </Text>
          <TextField.Root name="filters" defaultValue={excludeFilters.join(", ")} placeholder="broken, parts only" />
        </label>

        <Text as="label" size="2" weight="bold">
          <Flex align="center" gap="2">
            <Switch checked={on} onCheckedChange={setOn} /> Active
          </Flex>
        </Text>

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
            <Link href={`/admin/searches/${searchId}`}>Cancel</Link>
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}
