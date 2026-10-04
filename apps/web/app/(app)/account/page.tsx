import { Card, Flex, Heading, Text } from "@radix-ui/themes";

import { AccountForm } from "@/components/account-form";
import { TestAlertButton } from "@/components/test-alert-button";
import { requireUser } from "@/lib/auth/session";

import { saveAccount } from "../actions";

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Account</Heading>
      <Card size={{ initial: "2", sm: "3" }}>
        <Flex direction="column" gap="4">
          <Text size="2" color="gray">
            Alerts and sign-in links both go to the destination below. Save any change, then send a test alert.
          </Text>
          <AccountForm
            action={saveAccount}
            defaults={{
              name: user.name,
              channel: user.notifyChannel,
              target: user.notifyTarget,
              pickupPhone: user.pickupPhone ?? "",
              pickupNote: user.pickupNote ?? "",
            }}
          />
          <TestAlertButton />
        </Flex>
      </Card>
    </Flex>
  );
}
