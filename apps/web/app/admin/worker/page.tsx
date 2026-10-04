import { Badge, Card, Flex, Grid, Heading, Table, Text } from "@radix-ui/themes";

import { getWorkerHealth } from "../queries";
import { ScrapeNowButton } from "./scrape-now";

export const dynamic = "force-dynamic";

const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString() : "—");

// Health of the TypeScript worker (apps/worker): heartbeat, per-URL parse
// health, and notifications that failed. ponytail: plain tables; the UI pass
// will fold the important bits into the overview.
export default async function WorkerPage() {
  const { status, urls, failed } = await getWorkerHealth();
  const stale = !status?.lastTickAt || Date.now() - status.lastTickAt.getTime() > 3 * 60_000;

  return (
    <Flex direction="column" gap="4">
      <Flex align="center" justify="between" wrap="wrap" gap="3">
        <Heading size="6">Worker</Heading>
        <ScrapeNowButton />
      </Flex>

      <Grid columns={{ initial: "2", md: "4" }} gap="3">
        <Card>
          <Text as="div" size="1" color="gray">
            Last tick
          </Text>
          <Flex align="center" gap="2">
            <Text size="2">{fmt(status?.lastTickAt)}</Text>
            <Badge color={stale ? "red" : "green"}>{stale ? "stale" : "alive"}</Badge>
          </Flex>
        </Card>
        <Card>
          <Text as="div" size="1" color="gray">
            Notifications
          </Text>
          <Badge color={status?.notifyDryRun ? "amber" : "green"}>{status?.notifyDryRun ? "dry run" : "live"}</Badge>
        </Card>
        <Card>
          <Text as="div" size="1" color="gray">
            Classifier failures (window)
          </Text>
          <Text size="4" weight="bold">
            {status?.classifierFailures ?? 0}
          </Text>
        </Card>
        <Card>
          <Text as="div" size="1" color="gray">
            Fail-open alerts
          </Text>
          <Badge color={status?.failOpenAlertsPaused ? "red" : "green"}>
            {status?.failOpenAlertsPaused ? "paused" : "allowed"}
          </Badge>
        </Card>
      </Grid>

      <Card>
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>URL</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">Watchers</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">Parsed</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Health</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Last scraped</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {urls.map(({ url, watchers }) => (
              <Table.Row key={url.id}>
                <Table.Cell>
                  <Text size="1" style={{ wordBreak: "break-all" }}>
                    {url.url}
                  </Text>
                </Table.Cell>
                <Table.Cell align="right">{watchers}</Table.Cell>
                <Table.Cell align="right">{url.lastParsedCount ?? "—"}</Table.Cell>
                <Table.Cell>
                  {url.lastError ? (
                    <Badge color="red" title={url.lastError}>
                      error
                    </Badge>
                  ) : url.consecutiveEmpty >= 3 ? (
                    <Badge color="red">empty ×{url.consecutiveEmpty}</Badge>
                  ) : (
                    <Badge color="green">ok</Badge>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="gray">
                    {fmt(url.lastScrapedAt)}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card>

      {failed.length ? (
        <Card>
          <Heading size="3" mb="2">
            Failed notifications
          </Heading>
          <Table.Root variant="ghost">
            <Table.Body>
              {failed.map((n) => (
                <Table.Row key={n.id}>
                  <Table.Cell>{n.title}</Table.Cell>
                  <Table.Cell>{n.channel}</Table.Cell>
                  <Table.Cell>
                    <Text size="1" color="red">
                      {n.error}
                    </Text>
                  </Table.Cell>
                  <Table.Cell align="right">×{n.attempts}</Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card>
      ) : null}
    </Flex>
  );
}
