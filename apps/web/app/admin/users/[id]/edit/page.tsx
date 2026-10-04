import { Card, Flex, Heading } from "@radix-ui/themes";
import { notFound } from "next/navigation";

import { getUser } from "../../../queries";
import { UserForm } from "../../../user-form";

export const dynamic = "force-dynamic";

export default async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getUser(Number(id));
  if (!data) notFound();
  const { user } = data;

  return (
    <Flex direction="column" gap="5">
      <Heading size="6">Edit {user.name}</Heading>
      <Card>
        <UserForm
          userId={user.id}
          name={user.name}
          channel={user.notifyChannel}
          target={user.notifyTarget}
          pickupPhone={user.pickupPhone ?? ""}
          pickupNote={user.pickupNote ?? ""}
        />
      </Card>
    </Flex>
  );
}
