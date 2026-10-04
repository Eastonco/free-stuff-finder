"use client";

import { Button, Dialog, Flex, Text, TextArea } from "@radix-ui/themes";
import { useState } from "react";

import { draftPickupMessage } from "./actions";

type Props = { listingId: number; link: string; size?: "1" | "2" };

export default function GetButton({ listingId, link, size = "2" }: Props) {
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function generate() {
    setLoading(true);
    setError("");
    setText("");
    setCopied(false);
    try {
      setText(await draftPickupMessage(listingId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to draft message.");
    } finally {
      setLoading(false);
    }
  }

  async function copyAndOpen() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.open(link, "_blank", "noopener");
  }

  return (
    <Dialog.Root onOpenChange={(open) => open && generate()}>
      <Dialog.Trigger>
        <Button size={size}>GET</Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="520px">
        <Dialog.Title>Draft pickup message</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          AI-written from the listing. Edit it, then copy &amp; paste into the listing&apos;s reply form.
        </Dialog.Description>

        {loading ? (
          <Text size="2" color="gray">
            Generating…
          </Text>
        ) : error ? (
          <Text size="2" color="red">
            {error}
          </Text>
        ) : (
          <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={8} />
        )}

        <Flex gap="3" mt="3" justify="end">
          <Button variant="soft" color="gray" onClick={generate} disabled={loading}>
            Regenerate
          </Button>
          <Button onClick={copyAndOpen} disabled={loading || !text}>
            {copied ? "Copied ✓" : "Copy & open CL"}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
