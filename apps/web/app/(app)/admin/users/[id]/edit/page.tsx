import { Card, Flex, Heading } from "@radix-ui/themes";
import { notFound } from "next/navigation";

import { AccountForm } from "@/components/account-form";

import { saveAccount } from "../../../../actions";
import { getUser } from "../../../queries";

export const dynamic = "force-dynamic";

export default async function EditUser({ params }: { params: Promise<{ id: string }> }) {
  const data = await getUser(Number((await params).id));
  if (!data) notFound();
  const { user } = data;

  return (
    <Flex direction="column" gap="5">
      <Heading size="6">Edit {user.name}</Heading>
      <Card size="3">
        <AccountForm
          action={saveAccount}
          userId={user.id}
          cancelHref={`/admin/users/${user.id}`}
          defaults={{
            name: user.name,
            channel: user.notifyChannel,
            target: user.notifyTarget,
            pickupPhone: user.pickupPhone ?? "",
            pickupNote: user.pickupNote ?? "",
          }}
        />
      </Card>
    </Flex>
  );
}
