import { Card, Flex, Heading, Link as RLink, Table, Text } from "@radix-ui/themes";
import Link from "next/link";

import { listUsers } from "../queries";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const rows = await listUsers();
  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Users</Heading>
      <Card>
        <Table.Root variant="ghost">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeaderCell>Name</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Channel</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Target</Table.ColumnHeaderCell>
              <Table.ColumnHeaderCell>Created</Table.ColumnHeaderCell>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {rows.map((u) => (
              <Table.Row key={u.id}>
                <Table.Cell>
                  <RLink asChild>
                    <Link href={`/admin/users/${u.id}`}>{u.name}</Link>
                  </RLink>
                </Table.Cell>
                <Table.Cell>{u.notifyChannel}</Table.Cell>
                <Table.Cell>
                  <Text size="2">{u.notifyTarget}</Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="gray">
                    {u.createdAt}
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
