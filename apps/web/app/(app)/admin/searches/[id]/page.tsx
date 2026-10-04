import { Badge, Button, Card, DataList, Flex, Heading, Link as RLink, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtTime } from "@/lib/time";
import { getSearch } from "../../queries";

export const dynamic = "force-dynamic";

function verdictColor(label: string | null): "green" | "red" | "gray" {
  return label === "want" ? "green" : label === "skip" ? "red" : "gray";
}

export default async function SearchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getSearch(Number(id));
  if (!data) notFound();
  const { search, owner, listings, stats } = data;

  return (
    <Flex direction="column" gap="5">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Flex align="center" gap="3" wrap="wrap">
          <Heading size="6">Search #{search.id}</Heading>
          <Badge color={search.active ? "green" : "gray"}>{search.active ? "active" : "inactive"}</Badge>
        </Flex>
        <Button asChild variant="soft">
          <Link href={`/admin/searches/${search.id}/edit`}>Edit</Link>
        </Button>
      </Flex>

      <Card>
        <DataList.Root orientation={{ initial: "vertical", sm: "horizontal" }}>
          <DataList.Item>
            <DataList.Label>Owner</DataList.Label>
            <DataList.Value>
              {owner ? (
                <RLink asChild>
                  <Link href={`/admin/users/${owner.id}`}>{owner.name}</Link>
                </RLink>
              ) : (
                `#${search.userId}`
              )}
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>Wishlist</DataList.Label>
            <DataList.Value>{search.preferencePrompt}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>Excludes</DataList.Label>
            <DataList.Value>{search.excludeFilters.join(", ") || "—"}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>URLs</DataList.Label>
            <DataList.Value>
              <Flex direction="column" gap="1">
                {search.urls.map((u, i) => (
                  <RLink key={i} href={u} target="_blank" rel="noreferrer" size="2">
                    {u}
                  </RLink>
                ))}
              </Flex>
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>Listings</DataList.Label>
            <DataList.Value>
              {stats.total} total · <Text weight="bold">{stats.wants}</Text> wanted · last {stats.last || "—"}
            </DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>Created</DataList.Label>
            <DataList.Value>{fmtTime(search.createdAt)}</DataList.Value>
          </DataList.Item>
        </DataList.Root>
      </Card>

      <Flex direction="column" gap="2">
        <Heading size="4">Listings</Heading>
        <Card>
          <Table.Root variant="ghost" className="stack-table">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>When</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Verdict</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Title</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Reason</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {listings.map((l) => (
                <Table.Row key={l.id}>
                  <Table.Cell>
                    <Text size="1" color="gray">
                      {l.timeScraped || ""}
                    </Text>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={verdictColor(l.aiLabel)}>
                      {l.aiLabel ?? "baseline"}
                      {l.aiScore != null ? ` ${l.aiScore}` : ""}
                    </Badge>
                  </Table.Cell>
                  <Table.Cell data-primary>
                    <RLink asChild>
                      <Link href={`/admin/listings/${l.id}`}>{l.title}</Link>
                    </RLink>
                  </Table.Cell>
                  <Table.Cell data-full>
                    <Text size="1" color="gray">
                      {l.aiReason || ""}
                    </Text>
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Root>
        </Card>
      </Flex>
    </Flex>
  );
}
