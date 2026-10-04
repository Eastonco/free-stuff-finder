// Scrape one URL: parse it, record any posts we've never seen, and create a
// match row for every (watching search × listed post) pair that lacks one.
// The first scrape for a watch is its baseline: rows are stored as 'baseline'
// with no classification and no alert, so new searches don't flood anyone.
import { and, eq, inArray, isNotNull, isNull, matches, posts, searchUrls, searchWatches } from "@fsf/db";
import { HttpError, parseSearchPage } from "@fsf/engine";

import type { Ctx } from "../context";

export type ScrapeResult = { parsed: number; newPosts: number; baselined: number; queued: number };

export async function runScrape(ctx: Ctx, data: { searchUrlId: number }): Promise<ScrapeResult | null> {
  const { db } = ctx;
  const [target] = await db.select().from(searchUrls).where(eq(searchUrls.id, data.searchUrlId)).limit(1);
  if (!target) return null;

  let listed: ReturnType<typeof parseSearchPage>;
  try {
    listed = parseSearchPage(await ctx.fetchHtml(target.url));
  } catch (err) {
    const message = err instanceof HttpError ? err.message : `${(err as Error)?.name}: ${(err as Error)?.message}`;
    ctx.log.warn("scrape failed", { url: target.url, error: message });
    await db
      .update(searchUrls)
      .set({ lastError: message, nextScrapeAt: nextSlot(ctx) })
      .where(eq(searchUrls.id, target.id));
    return null;
  }

  const now = ctx.now();
  const result: ScrapeResult = { parsed: listed.length, newPosts: 0, baselined: 0, queued: 0 };
  let pendingIds: number[] = [];

  if (listed.length) {
    // Look first, insert only what's missing. An INSERT that hits ON CONFLICT
    // still consumes a sequence value, so inserting all ~360 listed posts every
    // cycle would burn ids ~1000x faster than real rows arrive. ON CONFLICT stays
    // as a guard for the rare race with a concurrent scrape of an overlapping URL.
    const sourceIds = listed.map((p) => p.sourceId);
    const known = await postIdsFor(db, sourceIds);
    const unseen = listed.filter((p) => !known.has(p.sourceId));
    const inserted = unseen.length
      ? await db
          .insert(posts)
          .values(unseen.map((p) => ({ sourceId: p.sourceId, link: p.link, title: p.title, location: p.location })))
          .onConflictDoNothing()
          .returning({ id: posts.id, sourceId: posts.sourceId })
      : [];
    result.newPosts = inserted.length;
    for (const r of inserted) known.set(r.sourceId, r.id);
    // lost a race for some of them: read back the ids the other scrape inserted
    const postIds =
      inserted.length < unseen.length ? [...(await postIdsFor(db, sourceIds)).values()] : [...known.values()];

    await db.transaction(async (tx) => {
      /** Inserts (searchId, post) matches that don't exist yet; returns the new match ids. */
      const insertMissing = async (searchId: number, row: { status: string; decidedAt?: Date }) => {
        const have = await tx
          .select({ postId: matches.postId })
          .from(matches)
          .where(and(eq(matches.searchId, searchId), inArray(matches.postId, postIds)));
        const haveSet = new Set(have.map((h) => h.postId));
        const missing = postIds.filter((id) => !haveSet.has(id));
        if (!missing.length) return [];
        const rows = await tx
          .insert(matches)
          .values(missing.map((postId) => ({ searchId, postId, ...row })))
          .onConflictDoNothing()
          .returning({ id: matches.id });
        return rows.map((r) => r.id);
      };

      // Watches on their first scrape: everything currently listed is baseline.
      const fresh = await tx
        .update(searchWatches)
        .set({ baselinedAt: now })
        .where(and(eq(searchWatches.searchUrlId, target.id), isNull(searchWatches.baselinedAt)))
        .returning({ searchId: searchWatches.searchId });
      for (const w of fresh) {
        result.baselined += (await insertMissing(w.searchId, { status: "baseline", decidedAt: now })).length;
      }

      // Everyone else: pairs without a row become 'pending' and get a match job.
      const baselinedIds = new Set(fresh.map((w) => w.searchId));
      const established = (
        await tx
          .select({ searchId: searchWatches.searchId })
          .from(searchWatches)
          .where(and(eq(searchWatches.searchUrlId, target.id), isNotNull(searchWatches.baselinedAt)))
      ).filter((w) => !baselinedIds.has(w.searchId));

      const pending: number[] = [];
      for (const w of established) pending.push(...(await insertMissing(w.searchId, { status: "pending" })));
      pendingIds = pending;
    });
    result.queued = pendingIds.length;
  }

  // Enqueued after commit; the schedule sweeper requeues anything a crash in between strands.
  if (pendingIds.length) {
    await ctx.enqueue(
      "match",
      pendingIds.map((id) => ({ data: { matchId: id }, singletonKey: `match:${id}` })),
    );
  }

  const consecutiveEmpty = listed.length ? 0 : target.consecutiveEmpty + 1;
  if (consecutiveEmpty >= ctx.settings.emptyParseWarnAfter) {
    ctx.log.warn("search page keeps parsing empty — layout change or block?", { url: target.url, consecutiveEmpty });
  }
  await db
    .update(searchUrls)
    .set({
      lastScrapedAt: now,
      lastParsedCount: listed.length,
      consecutiveEmpty,
      lastError: null,
      nextScrapeAt: nextSlot(ctx),
    })
    .where(eq(searchUrls.id, target.id));

  ctx.log.info("scraped", { url: target.url, ...result });
  return result;
}

/** sourceId → post id for the posts we already have. */
async function postIdsFor(db: Ctx["db"], sourceIds: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: posts.id, sourceId: posts.sourceId })
    .from(posts)
    .where(and(eq(posts.source, "craigslist"), inArray(posts.sourceId, sourceIds)));
  return new Map(rows.map((r) => [r.sourceId, r.id]));
}

/** now + interval, jittered ±20% so URLs don't all fire on the same tick. */
function nextSlot(ctx: Ctx): Date {
  const jitter = 0.8 + Math.random() * 0.4;
  return new Date(ctx.now().getTime() + ctx.settings.scrapeIntervalSeconds * 1000 * jitter);
}
