"use client";

import { Button } from "@radix-ui/themes";
import { useState, useTransition } from "react";

import { scrapeNow } from "../actions";

export function ScrapeNowButton() {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await scrapeNow();
          setDone(true);
        })
      }
    >
      {done ? "Queued — within a minute" : pending ? "Queuing…" : "Scrape now"}
    </Button>
  );
}
