import { Badge, Card, Flex, Heading, Link as RLink, Table, Text } from "@radix-ui/themes";
import Link from "next/link";

import { listSearches } from "../queries";

export const dynamic = "force-dynamic";

export default async function SearchesPage() {
  const rows = await listSearches();
  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Searches</Heading>
      <Card>
        <Table.Root variant="ghost" className="stack-table">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Owner</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Wishlist</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Active</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">Listings</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell align="right">Wanted</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Last scraped</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map(({ search, owner, total, wants, last }) => (
              <Table.Row key={search.id}>
                <Table.Cell data-primary>
                  <RLink asChild>
                    <Link href={`/admin/searches/${search.id}`}>{owner ?? `#${search.userId}`}</Link>
                  </RLink>
                </Table.Cell>
                <Table.Cell data-full>
                  <Text size="2">{search.preferencePrompt}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Badge color={search.active ? "green" : "gray"}>{search.active ? "yes" : "no"}</Badge>
                </Table.Cell>
                <Table.Cell align="right" data-label="Listings">
                  {total}
                </Table.Cell>
                <Table.Cell align="right" data-label="Wanted">
                  <Text weight="bold">{wants}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="gray">
                    {last || "—"}
                  </Text>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      </Card>
    </Flex>
  );
}
