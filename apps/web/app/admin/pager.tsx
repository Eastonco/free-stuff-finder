import { Button, Flex, Text, TextField } from "@radix-ui/themes";
import Link from "next/link";

// URL-based prev/next pager + a native "go to page" form. Server-rendered, no
// client state. hasNext is derived by the caller fetching one row past the page size.
export function Pager({ basePath, page, hasNext }: { basePath: string; page: number; hasNext: boolean }) {
  return (
    <Flex align="center" justify="between" gap="3" wrap="wrap">
      <PagerLink href={`${basePath}?page=${page - 1}`} disabled={page <= 1}>
        ← Prev
      </PagerLink>

      {/* Native GET form: submitting navigates to ?page=N. No JS. */}
      <form action={basePath} method="get">
        <Flex align="center" gap="2">
          <Text size="1" color="gray">
            Page
          </Text>
          <TextField.Root
            key={page} // remount on navigation so the uncontrolled value reflects the current page
            name="page"
            type="number"
            min={1}
            defaultValue={page}
            style={{ width: "4rem" }}
            aria-label="Go to page"
          />
        </Flex>
      </form>

      <PagerLink href={`${basePath}?page=${page + 1}`} disabled={!hasNext}>
        Next →
      </PagerLink>
    </Flex>
  );
}

// A disabled <Link> would still navigate, so render a plain disabled Button at the ends.
function PagerLink({ href, disabled, children }: { href: string; disabled: boolean; children: React.ReactNode }) {
  if (disabled) {
    return (
      <Button variant="soft" color="gray" disabled>
        {children}
      </Button>
    );
  }
  return (
    <Button asChild variant="soft" color="gray">
      <Link href={href}>{children}</Link>
    </Button>
  );
}

// Parse ?page=N into a 1-based page number, clamped to >= 1.
export function pageFromParam(value: string | string[] | undefined): number {
  return Math.max(1, Number(Array.isArray(value) ? value[0] : value) || 1);
}
