"use client";

import { useState, useTransition } from "react";
import { Flex, Switch, Text } from "@radix-ui/themes";

import { setScraperEnabled } from "./actions";

// Auto-saves on change — single control, no Save button needed.
export function ScraperToggle({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();

  return (
    <Text as="label" size="2" weight="bold" color="gray">
      <Flex align="center" gap="2">
        <Switch
          checked={on}
          disabled={pending}
          onCheckedChange={(v) => {
            setOn(v);
            start(() => setScraperEnabled(v));
          }}
        />
        {on ? "Scraping on" : "Scraping off"}
      </Flex>
    </Text>
  );
}
