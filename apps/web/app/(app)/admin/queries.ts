// Shared admin data access. Server-only — imported by admin pages (all force-dynamic).
// Everything reads the worker's tables (matches + posts). Python's `listings` is a
// frozen archive since the cutover (copied in by migration 0004).
// Per-search stats come from one grouped query per page, never one query per search.
import {
  and,
  count,
  desc,
  eq,
  inArray,
  matches,
  max,
  ne,
  notifications,
  posts,
  searches,
  searchUrls,
  searchWatches,
  sql,
  users,
  workerStatus,
} from "@fsf/db";

import { db } from "@/db";
import { fmtTime } from "@/lib/time";

export type Search = typeof searches.$inferSelect;
export type User = typeof users.$inferSelect;

/** The worker's heartbeat and kill-switch, in the shape the Overview header uses. */
export async function getStatus() {
  const [status] = await db.select().from(workerStatus).limit(1);
  if (!status) return null;
  return {
    lastCycleAt: status.lastTickAt?.toISOString() ?? null,
    cycleCount: status.tickCount,
    scraperEnabled: status.enabled,
  };
}

type SearchStats = { total: number; wants: number; last: string | null };
const EMPTY_STATS: SearchStats = { total: 0, wants: 0, last: null };

// Per-search aggregates (posts seen, wanted, last activity) for many searches in one query.
export async function statsBySearch(searchIds: number[]): Promise<Map<number, SearchStats>> {
  if (!searchIds.length) return new Map();
  const rows = await db
    .select({
      searchId: matches.searchId,
      total: count(),
      wants: sql<number>`count(*) filter (where ${matches.label} = 'want')`.mapWith(Number),
      last: max(matches.createdAt),
    })
    .from(matches)
    .where(inArray(matches.searchId, searchIds))
    .groupBy(matches.searchId);
  return new Map(rows.map(({ searchId, last, ...stats }) => [searchId, { ...stats, last: fmtTime(last) || null }]));
}

export async function searchStats(searchId: number): Promise<SearchStats> {
  return (await statsBySearch([searchId])).get(searchId) ?? EMPTY_STATS;
}

export async function getOverview() {
  const [[{ users: nUsers } = { users: 0 }], [{ searches: nSearches } = { searches: 0 }], labelRows] =
    await Promise.all([
      db.select({ users: count() }).from(users),
      db.select({ searches: count() }).from(searches),
      db.select({ label: matches.label, n: count() }).from(matches).groupBy(matches.label),
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

// One row per (search, post) verdict, newest first, with its owner's name.
// Field names predate the cutover (they mirrored `listings`); the id is the match id.
const listingRow = {
  id: matches.id,
  title: posts.title,
  link: posts.link,
  aiLabel: matches.label,
  aiScore: matches.score,
  aiReason: matches.reason,
  at: matches.createdAt,
};

export async function recentListings(limit = 20, offset = 0) {
  const rows = await db
    .select({ ...listingRow, owner: users.name })
    .from(matches)
    .innerJoin(posts, eq(posts.id, matches.postId))
    .leftJoin(searches, eq(matches.searchId, searches.id))
    .leftJoin(users, eq(searches.userId, users.id))
    .where(ne(matches.status, "baseline"))
    .orderBy(desc(matches.createdAt), desc(matches.id))
    .limit(limit)
    .offset(offset);
  return rows.map(({ at, ...r }) => ({ ...r, timeScraped: fmtTime(at) }));
}

// --- list pages ---

export async function listSearches() {
  const rows = await db
    .select({ search: searches, owner: users.name })
    .from(searches)
    .leftJoin(users, eq(searches.userId, users.id))
    .orderBy(desc(searches.id));
  const stats = await statsBySearch(rows.map((r) => r.search.id));
  return rows.map(({ search, owner }) => ({ search, owner, ...(stats.get(search.id) ?? EMPTY_STATS) }));
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
  const rows = await db
    .select(listingRow)
    .from(matches)
    .innerJoin(posts, eq(posts.id, matches.postId))
    .where(and(eq(matches.searchId, id), ne(matches.status, "baseline")))
    .orderBy(desc(matches.createdAt), desc(matches.id))
    .limit(100);
  return {
    search,
    owner: owner ?? null,
    listings: rows.map(({ at, ...r }) => ({ ...r, timeScraped: fmtTime(at) })),
    stats: await searchStats(id),
  };
}

/** One verdict (match) with its post, search and owner. */
export async function getListing(id: number) {
  const [row] = await db
    .select({ match: matches, post: posts })
    .from(matches)
    .innerJoin(posts, eq(posts.id, matches.postId))
    .where(eq(matches.id, id))
    .limit(1);
  if (!row) return null;
  const { match, post } = row;
  const [search] = await db.select().from(searches).where(eq(searches.id, match.searchId)).limit(1);
  const owner = search
    ? ((await db.select().from(users).where(eq(users.id, search.userId)).limit(1))[0] ?? null)
    : null;
  return {
    listing: {
      id: match.id,
      title: post.title,
      link: post.link,
      imageUrl: post.imageUrl,
      location: post.location ?? "",
      aiLabel: match.label,
      aiScore: match.score,
      aiReason: match.reason,
      timePosted: fmtTime(post.postedAt) || "—",
      timeScraped: fmtTime(match.createdAt),
    },
    search: search ?? null,
    owner,
  };
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
