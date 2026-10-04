import { Badge, Button, Callout, Card, Flex, Grid, Heading, Link as RLink, Text } from "@radix-ui/themes";
import Link from "next/link";

import { ActiveToggle } from "@/components/search-card-actions";
import { requireUser } from "@/lib/auth/session";
import { searchesForUser } from "@/lib/searches";

export default async function MySearches({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const rows = await searchesForUser(user.id);
  const { welcome } = await searchParams;

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between" gap="3">
        <Heading size="6">My searches</Heading>
        <Button asChild>
          <Link href="/searches/new">New search</Link>
        </Button>
      </Flex>

      {welcome ? (
        <Callout.Root color="green">
          <Callout.Text>
            You&apos;re set up. New matches start arriving within a few minutes (items already posted are skipped, so
            you aren&apos;t flooded). <RLink href="/account">Send yourself a test alert</RLink> to check delivery.
          </Callout.Text>
        </Callout.Root>
      ) : null}

      {rows.length === 0 ? (
        <Card size="3">
          <Flex direction="column" gap="3" align="start">
            <Text>No searches yet. Add one and describe what you&apos;re after.</Text>
            <Button asChild>
              <Link href="/searches/new">Create your first search</Link>
            </Button>
          </Flex>
        </Card>
      ) : (
        <Grid columns={{ initial: "1", sm: "2" }} gap="3">
          {rows.map(({ search, wants, last }) => (
            <Card key={search.id} size="2">
              <Flex direction="column" gap="3" height="100%">
                <Link href={`/searches/${search.id}`} style={{ textDecoration: "none", color: "inherit" }}>
                  <Text
                    as="p"
                    weight="medium"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {search.preferencePrompt}
                  </Text>
                </Link>
                <Flex gap="2" wrap="wrap">
                  <Badge color="gray" variant="soft">
                    {search.urls.length} {search.urls.length === 1 ? "area" : "areas"}
                  </Badge>
                  {search.excludeFilters.length ? (
                    <Badge color="gray" variant="soft">
                      {search.excludeFilters.length} excluded words
                    </Badge>
                  ) : null}
                  <Badge color="grass" variant="soft">
                    {wants} matches
                  </Badge>
                </Flex>
                <Flex align="center" justify="between" mt="auto">
                  <ActiveToggle searchId={search.id} active={search.active} />
                  <Flex align="center" gap="3">
                    {last ? (
                      <Text size="1" color="gray">
                        last match {last}
                      </Text>
                    ) : null}
                    <Button asChild size="1" variant="soft">
                      <Link href={`/searches/${search.id}`}>Edit</Link>
                    </Button>
                  </Flex>
                </Flex>
              </Flex>
            </Card>
          ))}
        </Grid>
      )}
    </Flex>
  );
}
