import { Card, Flex, Heading } from "@radix-ui/themes";

import { EMPTY_SEARCH, SearchForm } from "@/components/search-form";

import { saveSearch } from "../../actions";

export default function NewSearch() {
  return (
    <Flex direction="column" gap="4">
      <Heading size="6">New search</Heading>
      <Card size="3">
        <SearchForm action={saveSearch} defaults={EMPTY_SEARCH} submitLabel="Create search" cancelHref="/searches" />
      </Card>
    </Flex>
  );
}
