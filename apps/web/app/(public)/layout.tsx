import { Box, Container, Flex, Heading, Text } from "@radix-ui/themes";
import Link from "next/link";

// Signed-out pages: one narrow centered column.
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <Box style={{ minHeight: "100vh", background: "var(--gray-2)" }} px="4" py={{ initial: "5", sm: "8" }}>
      <Container size="1">
        <Flex direction="column" gap="5">
          <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
            <Heading size="5">Free Stuff Finder</Heading>
            <Text size="2" color="gray">
              Get pinged only about free items you&apos;d actually want.
            </Text>
          </Link>
          {children}
        </Flex>
      </Container>
    </Box>
  );
}
