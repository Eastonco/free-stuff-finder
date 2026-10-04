import "@radix-ui/themes/styles.css";
import { Box, Flex, Theme } from "@radix-ui/themes";

import { AutoRefresh } from "./auto-refresh";
import { Sidebar } from "./sidebar";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Theme appearance="light" accentColor="indigo" grayColor="slate" panelBackground="solid">
      {/* .admin-shell triggers the full-bleed body override in globals.css */}
      <Flex className="admin-shell" align="stretch" style={{ background: "var(--gray-1)" }}>
        <Sidebar />
        <Box flexGrow="1" p="6" style={{ minWidth: 0 }}>
          {children}
        </Box>
      </Flex>
      <AutoRefresh />
    </Theme>
  );
}
