import { Badge, Card, DataList, Flex, Heading, Link as RLink } from "@radix-ui/themes";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getListing } from "../../queries";
import GetButton from "../get-button";

export const dynamic = "force-dynamic";

function verdictColor(label: string | null): "green" | "red" | "gray" {
  return label === "want" ? "green" : label === "skip" ? "red" : "gray";
}

export default async function ListingDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getListing(Number(id));
  if (!data) notFound();
  const { listing, search, owner } = data;

  return (
    <Flex direction="column" gap="5">
      <Flex justify="between" align="center" gap="4" wrap="wrap">
        <Heading size="6">{listing.title}</Heading>
        <GetButton listingId={listing.id} link={listing.link} />
      </Flex>

      <Flex gap="5" wrap="wrap" align="start">
        {listing.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={listing.imageUrl}
            alt=""
            style={{
              width: 220,
              maxWidth: "100%",
              height: "auto",
              borderRadius: "var(--radius-3)",
              border: "1px solid var(--gray-a5)",
            }}
          />
        )}
        <Card style={{ flexGrow: 1, flexBasis: 280, minWidth: 0 }}>
          <DataList.Root orientation={{ initial: "vertical", sm: "horizontal" }}>
            <DataList.Item>
              <DataList.Label>Verdict</DataList.Label>
              <DataList.Value>
                <Badge color={verdictColor(listing.aiLabel)}>
                  {listing.aiLabel ?? "baseline"}
                  {listing.aiScore != null ? ` ${listing.aiScore}` : ""}
                </Badge>
              </DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>Reason</DataList.Label>
              <DataList.Value>{listing.aiReason || "—"}</DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>Owner</DataList.Label>
              <DataList.Value>
                {owner ? (
                  <RLink asChild>
                    <Link href={`/admin/users/${owner.id}`}>{owner.name}</Link>
                  </RLink>
                ) : (
                  "—"
                )}
              </DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>Search</DataList.Label>
              <DataList.Value>
                {search ? (
                  <RLink asChild>
                    <Link href={`/admin/searches/${search.id}`}>#{search.id}</Link>
                  </RLink>
                ) : (
                  "—"
                )}
              </DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>Location</DataList.Label>
              <DataList.Value>{listing.location}</DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>Posted</DataList.Label>
              <DataList.Value>{listing.timePosted}</DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>Scraped</DataList.Label>
              <DataList.Value>{listing.timeScraped}</DataList.Value>
            </DataList.Item>
            <DataList.Item>
              <DataList.Label>Link</DataList.Label>
              <DataList.Value>
                <RLink href={listing.link} target="_blank" rel="noreferrer">
                  Open listing
                </RLink>
              </DataList.Value>
            </DataList.Item>
          </DataList.Root>
        </Card>
      </Flex>
    </Flex>
  );
}
