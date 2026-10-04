import { Card, Flex, Heading } from "@radix-ui/themes";
import { notFound } from "next/navigation";

import { DeleteSearchButton } from "@/components/search-card-actions";
import { SearchForm } from "@/components/search-form";

import { saveSearch } from "../../../../actions";
import { getSearch } from "../../../queries";

export const dynamic = "force-dynamic";

export default async function EditSearch({ params }: { params: Promise<{ id: string }> }) {
  const data = await getSearch(Number((await params).id));
  if (!data) notFound();
  const { search, owner } = data;

  return (
    <Flex direction="column" gap="5">
      <Heading size="6">
        Edit search #{search.id}
        {owner ? ` (${owner.name})` : ""}
      </Heading>
      <Card size={{ initial: "2", sm: "3" }}>
        <SearchForm
          action={saveSearch}
          searchId={search.id}
          returnTo={`/admin/searches/${search.id}`}
          cancelHref={`/admin/searches/${search.id}`}
          submitLabel="Save"
          defaults={{
            prompt: search.preferencePrompt,
            urls: search.urls.join("\n"),
            filters: search.excludeFilters.join(", "),
            active: search.active,
          }}
        />
      </Card>
      <Flex>
        <DeleteSearchButton searchId={search.id} returnTo="/admin/searches" />
      </Flex>
    </Flex>
  );
}
