"use client";

import { Box, Flex, Heading, Text, Theme } from "@radix-ui/themes";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Add a future section by appending one row here.
const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/searches", label: "Searches" },
  { href: "/admin/listings", label: "Listings" },
  { href: "/admin/users", label: "Users" },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <Theme appearance="dark" hasBackground={false} asChild>
      <Box
        style={{
          width: 220,
          flexShrink: 0,
          minHeight: "100vh",
          background: "var(--gray-2)",
          borderRight: "1px solid var(--gray-a5)",
          padding: "var(--space-4)",
        }}
      >
        <Heading size="4" mb="5" style={{ paddingLeft: "var(--space-2)" }}>
          Free Stuff Finder
        </Heading>
        <Flex direction="column" gap="1" asChild>
          <nav>
            {NAV.map(({ href, label }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  style={{
                    display: "block",
                    padding: "var(--space-2) var(--space-3)",
                    borderRadius: "var(--radius-3)",
                    textDecoration: "none",
                    background: active ? "var(--accent-a4)" : "transparent",
                  }}
                >
                  <Text size="2" weight={active ? "bold" : "regular"} color={active ? undefined : "gray"}>
                    {label}
                  </Text>
                </Link>
              );
            })}
          </nav>
        </Flex>
      </Box>
    </Theme>
  );
}
