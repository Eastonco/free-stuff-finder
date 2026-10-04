// Shared admin data access. Server-only — imported by admin pages (all force-dynamic).
// N+1 count queries per search mirror the original page and are fine at this scale.
// ponytail: swap to grouped aggregates if a single page ever fans out to hundreds of searches.
import { and, count, desc, eq, max } from "drizzle-orm";

import { db } from "@/db";
import { listings, scraperStatus, searches, users } from "@/db/schema";

export type Search = typeof searches.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type User = typeof users.$inferSelect;

export async function getStatus() {
  const [status] = await db.select().from(scraperStatus).limit(1);
  return status ?? null;
}

// Per-search aggregates (total listings, wanted, last scrape). Reused by overview,
// searches list, and search detail.
export async function searchStats(searchId: number) {
  const [{ total }] = await db.select({ total: count() }).from(listings).where(eq(listings.searchId, searchId));
  const [{ wants }] = await db
    .select({ wants: count() })
    .from(listings)
    .where(and(eq(listings.searchId, searchId), eq(listings.aiLabel, "want")));
  const [{ last }] = await db
    .select({ last: max(listings.timeScraped) })
    .from(listings)
    .where(eq(listings.searchId, searchId));
  return { total, wants, last };
}

export async function getOverview() {
  const usersList = await db.select().from(users);
  const searchesList = await db.select().from(searches);
  const [{ nListings }] = await db.select({ nListings: count() }).from(listings);
  const labelRows = await db.select({ label: listings.aiLabel, n: count() }).from(listings).groupBy(listings.aiLabel);
  const labels = Object.fromEntries(labelRows.map((r) => [r.label ?? "baseline", r.n]));

  return {
    users: usersList.length,
    searches: searchesList.length,
    listings: nListings,
    want: labels.want ?? 0,
    skip: labels.skip ?? 0,
    baseline: labels.baseline ?? 0,
  };
}

// Recent listings joined to their owning user's name (listing → search.userId → user).
export async function recentListings(limit = 20, offset = 0) {
  return db
    .select({
      id: listings.id,
      title: listings.title,
      link: listings.link,
      aiLabel: listings.aiLabel,
      aiScore: listings.aiScore,
      aiReason: listings.aiReason,
      timeScraped: listings.timeScraped,
      owner: users.name,
    })
    .from(listings)
    .leftJoin(searches, eq(listings.searchId, searches.id))
    .leftJoin(users, eq(searches.userId, users.id))
    .orderBy(desc(listings.id))
    .limit(limit)
    .offset(offset);
}

// --- list pages ---

export async function listSearches() {
  const rows = await db
    .select({ search: searches, owner: users.name })
    .from(searches)
    .leftJoin(users, eq(searches.userId, users.id))
    .orderBy(desc(searches.id));
  return Promise.all(rows.map(async ({ search, owner }) => ({ search, owner, ...(await searchStats(search.id)) })));
}

export async function listUsers() {
  return db.select().from(users).orderBy(desc(users.id));
}

export async function listListingRows(limit = 100, offset = 0) {
  return recentListings(limit, offset);
}

// --- detail pages ---

export async function getSearch(id: number) {
  const [search] = await db.select().from(searches).where(eq(searches.id, id)).limit(1);
  if (!search) return null;
  const [owner] = await db.select().from(users).where(eq(users.id, search.userId)).limit(1);
  const rows = await db.select().from(listings).where(eq(listings.searchId, id)).orderBy(desc(listings.id)).limit(100);
  return { search, owner: owner ?? null, listings: rows, stats: await searchStats(id) };
}

export async function getListing(id: number) {
  const [listing] = await db.select().from(listings).where(eq(listings.id, id)).limit(1);
  if (!listing) return null;
  const [search] = await db.select().from(searches).where(eq(searches.id, listing.searchId)).limit(1);
  const owner = search
    ? ((await db.select().from(users).where(eq(users.id, search.userId)).limit(1))[0] ?? null)
    : null;
  return { listing, search: search ?? null, owner };
}

export async function getUser(id: number) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;
  const rows = await db.select().from(searches).where(eq(searches.userId, id)).orderBy(desc(searches.id));
  const searchesWithStats = await Promise.all(
    rows.map(async (search) => ({ search, ...(await searchStats(search.id)) })),
  );
  return { user, searches: searchesWithStats };
}
