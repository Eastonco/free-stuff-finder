import { Card, Flex, Heading, Link as RLink, Table, Text } from "@radix-ui/themes";
import Link from "next/link";
import { fmtTime } from "@/lib/time";
import { listUsers } from "../queries";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const rows = await listUsers();
  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Users</Heading>
      <Card>
        <Table.Root variant="ghost" className="stack-table">
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
                <Table.Cell data-primary>
                  <RLink asChild>
                    <Link href={`/admin/users/${u.id}`}>{u.name}</Link>
                  </RLink>
                </Table.Cell>
                <Table.Cell>{u.notifyChannel}</Table.Cell>
                <Table.Cell data-full>
                  <Text size="2" style={{ wordBreak: "break-all" }}>
                    {u.notifyTarget}
                  </Text>
                </Table.Cell>
                <Table.Cell>
                  <Text size="1" color="gray">
                    {fmtTime(u.createdAt)}
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
