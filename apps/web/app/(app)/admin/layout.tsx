import { Flex } from "@radix-ui/themes";

import { NavTabs } from "@/components/nav-tabs";
import { requireAdmin } from "@/lib/auth/session";

import { AutoRefresh } from "./auto-refresh";

const ADMIN_NAV = [
  { href: "/admin", label: "Overview", exact: true },
  { href: "/admin/searches", label: "Searches" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/worker", label: "Worker" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <Flex direction="column" gap="5">
      <NavTabs items={ADMIN_NAV} size="1" />
      {children}
      <AutoRefresh />
    </Flex>
  );
}
