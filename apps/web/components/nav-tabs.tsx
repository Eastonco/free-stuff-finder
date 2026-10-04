"use client";

import { TabNav } from "@radix-ui/themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; exact?: boolean };

/** A row of tab links; the one matching the current path is highlighted. */
export function NavTabs({ items, size = "2" }: { items: NavItem[]; size?: "1" | "2" }) {
  const pathname = usePathname();
  return (
    <TabNav.Root size={size}>
      {items.map(({ href, label, exact }) => (
        <TabNav.Link key={href} asChild active={exact ? pathname === href : pathname.startsWith(href)}>
          <Link href={href}>{label}</Link>
        </TabNav.Link>
      ))}
    </TabNav.Root>
  );
}
