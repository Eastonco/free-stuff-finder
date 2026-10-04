import { Button, Card, Flex, Heading, Text } from "@radix-ui/themes";

import { verifySignIn } from "./actions";

export const dynamic = "force-dynamic";

// The link only shows a button; the token is spent on the POST. Link previews
// (Discord, iMessage) fetch URLs on their own and would otherwise burn it.
export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <Card size="3">
      <form action={verifySignIn}>
        <input type="hidden" name="token" value={token} />
        <Flex direction="column" gap="4">
          <Heading size="4">Sign in</Heading>
          <Text color="gray">You&apos;ll stay signed in on this device for 30 days.</Text>
          <Button type="submit" size="3">
            Sign in to Free Stuff Finder
          </Button>
        </Flex>
      </form>
    </Card>
  );
}
