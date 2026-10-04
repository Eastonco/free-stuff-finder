import { Badge, Card, Flex, Grid, Heading, Link as RLink, Table, Text } from "@radix-ui/themes";
import Link from "next/link";

import { HeartbeatBadge } from "./auto-refresh";
import GetButton from "./listings/get-button";
import { Pager, pageFromParam } from "./pager";
import { getOverview, getStatus, recentListings } from "./queries";
import { ScraperToggle } from "./scraper-toggle";

export const dynamic = "force-dynamic"; // always read live data, never prerender

const PAGE_SIZE = 20;

function Stat({ label, value, color }: { label: string; value: number; color?: "green" }) {
  return (
    <Card>
      <Text as="div" size="7" weight="bold" color={color}>
        {value}
      </Text>
      <Text as="div" size="1" color="gray" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </Text>
    </Card>
  );
}

function verdictColor(label: string | null): "green" | "red" | "gray" {
  return label === "want" ? "green" : label === "skip" ? "red" : "gray";
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const page = pageFromParam((await searchParams).page);
  // Fetch one extra row to learn if there's a next page without a count query.
  const [stats, status, fetched] = await Promise.all([
    getOverview(),
    getStatus(),
    recentListings(PAGE_SIZE + 1, (page - 1) * PAGE_SIZE),
  ]);
  const hasNext = fetched.length > PAGE_SIZE;
  const recent = fetched.slice(0, PAGE_SIZE);

  return (
    <Flex direction="column" gap="5">
      <Flex align="center" justify="between" wrap="wrap" gap="3">
        <Heading size="6">Overview</Heading>
        <Flex align="center" gap="4">
          <ScraperToggle enabled={status?.scraperEnabled ?? true} />
          <Flex align="center" gap="2">
            <Text size="2" weight="bold" color="gray">
              Scraper
            </Text>
            <HeartbeatBadge lastCycleAt={status?.lastCycleAt ?? null} cycleCount={status?.cycleCount ?? null} />
          </Flex>
        </Flex>
      </Flex>

      <Grid columns={{ initial: "2", sm: "3", md: "6" }} gap="3">
        <Stat label="Users" value={stats.users} />
        <Stat label="Searches" value={stats.searches} />
        <Stat label="Listings" value={stats.listings} />
        <Stat label="Wanted" value={stats.want} color="green" />
        <Stat label="Skipped" value={stats.skip} />
        <Stat label="Baselined" value={stats.baseline} />
      </Grid>

      <Flex direction="column" gap="2">
        <Heading size="4">Recent classifications</Heading>
        <Card>
          <Table.Root variant="ghost">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>When</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Owner</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Verdict</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Reason</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell></Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {recent.map((l) => (
                <Table.Row key={l.id}>
                  <Table.Cell>
                    <Text size="1" color="gray">
                      {l.timeScraped || ""}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>{l.owner ?? "—"}</Table.Cell>
                  <Table.Cell>
                    <Badge color={verdictColor(l.aiLabel)}>
                      {l.aiLabel ?? "baseline"}
                      {l.aiScore != null ? ` ${l.aiScore}` : ""}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell>
                    <RLink asChild>
                      <Link href={`/admin/listings/${l.id}`}>{l.title}</Link>
                    </RLink>
                  </Table.Cell>
                  <Table.Cell>
                    <Text size="1" color="gray">
                      {l.aiReason || ""}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <GetButton listingId={l.id} link={l.link} size="1" />
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card>
        <Pager basePath="/admin" page={page} hasNext={hasNext} />
      </Flex>
    </Flex>
  );
}
