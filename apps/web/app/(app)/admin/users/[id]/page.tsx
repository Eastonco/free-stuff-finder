import { Badge, Button, Card, DataList, Flex, Heading, Link as RLink, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getUser } from "../../queries";

export const dynamic = "force-dynamic";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getUser(Number(id));
  if (!data) notFound();
  const { user, searches } = data;

  return (
    <Flex direction="column" gap="5">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Heading size="6">{user.name}</Heading>
        <Button asChild variant="soft">
          <Link href={`/admin/users/${user.id}/edit`}>Edit</Link>
        </Button>
      </Flex>

      <Card>
        <DataList.Root>
          <DataList.Item>
            <DataList.Label>Channel</DataList.Label>
            <DataList.Value>{user.notifyChannel}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>Target</DataList.Label>
            <DataList.Value>{user.notifyTarget}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>Pickup phone</DataList.Label>
            <DataList.Value>{user.pickupPhone || "—"}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>Note for sellers</DataList.Label>
            <DataList.Value>{user.pickupNote || "—"}</DataList.Value>
          </DataList.Item>
          <DataList.Item>
            <DataList.Label>Created</DataList.Label>
            <DataList.Value>{user.createdAt}</DataList.Value>
          </DataList.Item>
        </DataList.Root>
      </Card>

      <Flex direction="column" gap="2">
        <Heading size="4">Searches</Heading>
        <Card>
          <Table.Root variant="ghost">
            <Table.Header>
              <Table.Row>
                <Table.ColumnHeaderCell>Wishlist</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Active</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell align="right">Listings</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell align="right">Wanted</Table.ColumnHeaderCell>
                <Table.ColumnHeaderCell>Last scraped</Table.ColumnHeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {searches.map(({ search, total, wants, last }) => (
                <Table.Row key={search.id}>
                  <Table.Cell>
                    <RLink asChild>
                      <Link href={`/admin/searches/${search.id}`}>{search.preferencePrompt}</Link>
                    </RLink>
                  </Table.Cell>
                  <Table.Cell>
                    <Badge color={search.active ? "green" : "gray"}>{search.active ? "yes" : "no"}</Badge>
                  </Table.Cell>
                  <Table.Cell align="right">{total}</Table.Cell>
                  <Table.Cell align="right">
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
    </Flex>
  );
}
