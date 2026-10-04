"use client";

import { Button, Flex, Switch, Text, TextArea, TextField } from "@radix-ui/themes";
import Link from "next/link";
import { useActionState, useState } from "react";

import type { FormResult } from "@/lib/form";

import { Field, FormErrors } from "./field";

export type SearchValues = { prompt: string; urls: string; filters: string; active: boolean };

export const EMPTY_SEARCH: SearchValues = { prompt: "", urls: "", filters: "", active: true };

export const URLS_HINT =
  "One per line. Open the free section, set your area and radius on the map (the default 60 mi is too wide), sort by newest, and copy the URL.";

/** The search fields alone, so sign-up can embed them in its own form. */
export function SearchFields({ v }: { v: SearchValues }) {
  return (
    <>
      <Field label="What are you looking for?" hint="Plain English. The AI judges every new item against this.">
        <TextArea
          name="prompt"
          defaultValue={v.prompt}
          rows={3}
          placeholder="A road bike around 56cm, no kids' bikes. Or anything for a home workshop."
        />
      </Field>
      <Field label="Search URLs" hint={URLS_HINT}>
        <TextArea
          name="urls"
          defaultValue={v.urls}
          rows={3}
          placeholder="https://seattle.craigslist.org/search/zip?..."
          style={{ fontFamily: "var(--code-font-family)", fontSize: "var(--font-size-1)" }}
        />
      </Field>
      <Field
        label="Never alert me about"
        hint="Optional comma-separated words. Skipped before the AI, so they cost nothing."
      >
        <TextField.Root name="filters" defaultValue={v.filters} placeholder="broken, parts, gravel" />
      </Field>
    </>
  );
}

export function SearchForm({
  action,
  defaults,
  searchId,
  ownerId,
  returnTo,
  submitLabel,
  cancelHref,
}: {
  action: (prev: FormResult<SearchValues>, fd: FormData) => Promise<FormResult<SearchValues>>;
  defaults: SearchValues;
  searchId?: number;
  /** Admin creating a search for someone else. */
  ownerId?: number;
  /** Where to go after saving (defaults to /searches). */
  returnTo?: string;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const v = state?.values ?? defaults;
  const [active, setActive] = useState(v.active);

  return (
    <form action={formAction} key={JSON.stringify(v)}>
      {searchId ? <input type="hidden" name="searchId" value={searchId} /> : null}
      {ownerId ? <input type="hidden" name="userId" value={ownerId} /> : null}
      {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
      {active ? <input type="hidden" name="active" value="on" /> : null}
      <Flex direction="column" gap="4" maxWidth="640px">
        <SearchFields v={v} />
        <Text as="label" size="2" weight="medium">
          <Flex align="center" gap="2">
            <Switch checked={active} onCheckedChange={setActive} />
            {active ? "Active — checking for new items" : "Paused"}
          </Flex>
        </Text>
        <FormErrors errors={state?.errors} />
        <Flex gap="3">
          <Button type="submit" loading={pending}>
            {submitLabel}
          </Button>
          <Button asChild variant="soft" color="gray">
            <Link href={cancelHref}>Cancel</Link>
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}
