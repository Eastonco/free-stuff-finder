import { Card, Flex, Heading } from "@radix-ui/themes";
import { notFound } from "next/navigation";

import { getSearch } from "../../../queries";
import { SearchForm } from "../../../search-form";

export const dynamic = "force-dynamic";

export default async function EditSearch({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getSearch(Number(id));
  if (!data) notFound();
  const { search } = data;

  return (
    <Flex direction="column" gap="5">
      <Heading size="6">Edit search #{search.id}</Heading>
      <Card>
        <SearchForm
          searchId={search.id}
          urls={search.urls}
          prompt={search.preferencePrompt}
          excludeFilters={search.excludeFilters}
          active={search.active}
        />
      </Card>
    </Flex>
  );
}
