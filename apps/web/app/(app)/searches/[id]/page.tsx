import { eq, searches } from "@fsf/db";
import { Card, Flex, Heading, Link as RLink, Text } from "@radix-ui/themes";
import { notFound } from "next/navigation";

import { DeleteSearchButton } from "@/components/search-card-actions";
import { SearchForm } from "@/components/search-form";
import { db } from "@/db";
import { requireUser } from "@/lib/auth/session";
import { recentFinds } from "@/lib/searches";

import { saveSearch } from "../../actions";

export default async function EditSearch({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const [search] = await db
    .select()
    .from(searches)
    .where(eq(searches.id, Number((await params).id)))
    .limit(1);
  if (!search || (search.userId !== user.id && !user.isAdmin)) notFound();
  const finds = await recentFinds(search.id);

  return (
    <Flex direction="column" gap="4">
      <Heading size="6">Edit search</Heading>
      <Card size={{ initial: "2", sm: "3" }}>
        <SearchForm
          action={saveSearch}
          searchId={search.id}
          defaults={{
            prompt: search.preferencePrompt,
            urls: search.urls.join("\n"),
            filters: search.excludeFilters.join(", "),
            active: search.active,
          }}
          submitLabel="Save"
          cancelHref="/searches"
        />
      </Card>

      <Card size={{ initial: "2", sm: "3" }}>
        <Flex direction="column" gap="3">
          <Heading size="3">Recent matches</Heading>
          {finds.length === 0 ? (
            <Text color="gray">Nothing yet. Matches show up here as they&apos;re found.</Text>
          ) : (
            finds.map((f) => (
              <Flex key={f.id} direction="column">
                <RLink href={f.link} target="_blank" rel="noreferrer" weight="medium">
                  {f.title}
                </RLink>
                <Text size="1" color="gray">
                  {f.reason} · {f.at}
                </Text>
              </Flex>
            ))
          )}
        </Flex>
      </Card>

      <Flex>
        <DeleteSearchButton searchId={search.id} />
      </Flex>
    </Flex>
  );
}
