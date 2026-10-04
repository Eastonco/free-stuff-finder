import { Button, Card, Flex, Text } from "@radix-ui/themes";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function Landing() {
  if (await getCurrentUser()) redirect("/searches");
  return (
    <Card size={{ initial: "2", sm: "3" }}>
      <Flex direction="column" gap="4">
        <Text size="3">
          Save a search, describe what you want in plain English, and get an alert the moment a matching free item is
          posted. Everything else is filtered out for you.
        </Text>
        <Flex gap="3" wrap="wrap">
          <Button asChild size="3">
            <Link href="/signin">Sign in</Link>
          </Button>
          <Button asChild size="3" variant="soft">
            <Link href="/signup">Create an account</Link>
          </Button>
        </Flex>
        <Text size="1" color="gray">
          New accounts need an invite code from whoever runs this site.
        </Text>
      </Flex>
    </Card>
  );
}
