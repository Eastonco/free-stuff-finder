import { Flex, Skeleton } from "@radix-ui/themes";

// One Suspense boundary for the whole /admin section. Gives an instant skeleton on
// navigation (the sidebar in layout.tsx stays put) and — crucially — lets <Link>
// prefetch these force-dynamic routes, which it won't do without a loading boundary.
export default function Loading() {
  return (
    <Flex direction="column" gap="4">
      <Skeleton width="200px" height="34px" />
      <Skeleton height="110px" />
      <Skeleton height="260px" />
    </Flex>
  );
}
