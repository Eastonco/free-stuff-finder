import { Box, Button, Container, Flex, Text } from "@radix-ui/themes";
import Link from "next/link";

import { NavTabs } from "@/components/nav-tabs";
import { requireUser } from "@/lib/auth/session";

import { signOut } from "./actions";

export const dynamic = "force-dynamic";

// Every signed-in page: one shell, one nav. Admins see one extra tab.
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const nav = [
    { href: "/searches", label: "My searches" },
    { href: "/account", label: "Account" },
    ...(user.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <Box style={{ minHeight: "100vh", background: "var(--gray-2)" }}>
      <Box style={{ background: "var(--color-panel-solid)", borderBottom: "1px solid var(--gray-a5)" }} px="4">
        <Container size="4">
          <Flex align="center" justify="between" gap="3" pt="3">
            <Link href="/searches" style={{ textDecoration: "none", color: "inherit" }}>
              <Text weight="bold">Free Stuff Finder</Text>
            </Link>
            <Flex align="center" gap="3">
              <Text size="2" color="gray">
                {user.name}
              </Text>
              <form action={signOut}>
                <Button type="submit" size="1" variant="ghost" color="gray">
                  Sign out
                </Button>
              </form>
            </Flex>
          </Flex>
          <NavTabs items={nav} />
        </Container>
      </Box>
      <Box px="4" py="5">
        <Container size="4">{children}</Container>
      </Box>
    </Box>
  );
}
