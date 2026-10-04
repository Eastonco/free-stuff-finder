// Shared admin data access. Server-only — imported by admin pages (all force-dynamic).
// Per-search stats come from one grouped query per page, never one query per search.
import {
  count,
  desc,
  eq,
  inArray,
  listings,
  matches,
  max,
  notifications,
  posts,
  scraperStatus,
  searches,
  searchUrls,
  searchWatches,
  sql,
  users,
  workerStatus,
} from "@fsf/db";

import { db } from "@/db";

export type Search = typeof searches.$inferSelect;
export type Listing = typeof listings.$inferSelect;
export type User = typeof users.$inferSelect;

export async function getStatus() {
  const [status] = await db.select().from(scraperStatus).limit(1);
  return status ?? null;
}

type SearchStats = { total: number; wants: number; last: string | null };
const EMPTY_STATS: SearchStats = { total: 0, wants: 0, last: null };

// Per-search aggregates (total listings, wanted, last scrape) for many searches in one query.
export async function statsBySearch(searchIds: number[]): Promise<Map<number, SearchStats>> {
  if (!searchIds.length) return new Map();
  const rows = await db
    .select({
      searchId: listings.searchId,
      total: count(),
      wants: sql<number>`count(*) filter (where ${listings.aiLabel} = 'want')`.mapWith(Number),
      last: max(listings.timeScraped),
    })
    .from(listings)
    .where(inArray(listings.searchId, searchIds))
    .groupBy(listings.searchId);
  return new Map(rows.map(({ searchId, ...stats }) => [searchId, stats]));
}

export async function searchStats(searchId: number): Promise<SearchStats> {
  return (await statsBySearch([searchId])).get(searchId) ?? EMPTY_STATS;
}

export async function getOverview() {
  const [[{ users: nUsers } = { users: 0 }], [{ searches: nSearches } = { searches: 0 }], labelRows] =
    await Promise.all([
      db.select({ users: count() }).from(users),
      db.select({ searches: count() }).from(searches),
      db.select({ label: listings.aiLabel, n: count() }).from(listings).groupBy(listings.aiLabel),
    ]);
  const labels = Object.fromEntries(labelRows.map((r) => [r.label ?? "baseline", r.n]));

  return {
    users: nUsers,
    searches: nSearches,
    listings: labelRows.reduce((sum, r) => sum + r.n, 0),
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
  const stats = await statsBySearch(rows.map((r) => r.id));
  return { user, searches: rows.map((search) => ({ search, ...(stats.get(search.id) ?? EMPTY_STATS) })) };
}

// --- TS worker health ---

export async function getWorkerHealth() {
  const [[status], urls, failed] = await Promise.all([
    db.select().from(workerStatus).limit(1),
    db
      .select({
        url: searchUrls,
        watchers:
          sql<number>`(select count(*) from ${searchWatches} where ${searchWatches.searchUrlId} = ${searchUrls.id})`.mapWith(
            Number,
          ),
      })
      .from(searchUrls)
      .orderBy(desc(searchUrls.consecutiveEmpty), searchUrls.url),
    db
      .select({
        id: notifications.id,
        channel: notifications.channel,
        error: notifications.error,
        attempts: notifications.attempts,
        createdAt: notifications.createdAt,
        title: posts.title,
      })
      .from(notifications)
      .innerJoin(matches, eq(matches.id, notifications.matchId))
      .innerJoin(posts, eq(posts.id, matches.postId))
      .where(eq(notifications.status, "failed"))
      .orderBy(desc(notifications.id))
      .limit(20),
  ]);
  return { status: status ?? null, urls, failed };
}
