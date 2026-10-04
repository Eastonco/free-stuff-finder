// Every minute: sync which searches watch which URLs, claim the URLs that are
// due, and enqueue one scrape each. Also the heartbeat and the stuck-job sweeper.
import {
  and,
  eq,
  inArray,
  lt,
  lte,
  matches,
  notInArray,
  searches,
  searchUrls,
  searchWatches,
  sql,
  workerStatus,
} from "@fsf/db";
import { normalizeSearchUrl } from "@fsf/engine";

import type { Ctx } from "../context";

const STUCK_PENDING_MINUTES = 10;

export async function runSchedule(ctx: Ctx): Promise<{ enqueued: number; enabled: boolean }> {
  const { db } = ctx;
  const now = ctx.now();

  // The admin Overview toggle flips worker_status.enabled.
  const [status] = await db.select({ enabled: workerStatus.enabled }).from(workerStatus).limit(1);
  const enabled = status?.enabled ?? true;
  await heartbeat(ctx, now);
  if (!enabled) {
    ctx.log.info("scraper disabled via admin panel — skipping tick");
    return { enqueued: 0, enabled };
  }

  const watched = await syncWatches(ctx);

  // Claim due URLs by pushing next_scrape_at out, so a slow scrape can't be enqueued twice.
  const due = watched.length
    ? await db
        .update(searchUrls)
        .set({ nextScrapeAt: new Date(now.getTime() + ctx.settings.scrapeIntervalSeconds * 1000) })
        .where(and(inArray(searchUrls.id, watched), lte(searchUrls.nextScrapeAt, now)))
        .returning({ id: searchUrls.id })
    : [];
  if (due.length)
    await ctx.enqueue(
      "scrape-url",
      due.map((u) => ({ data: { searchUrlId: u.id }, singletonKey: `url:${u.id}` })),
    );

  // Safety net: a match row whose job got lost (crash between commit and enqueue) gets requeued.
  const stuck = await db
    .select({ id: matches.id })
    .from(matches)
    .where(
      and(
        eq(matches.status, "pending"),
        lt(matches.createdAt, new Date(now.getTime() - STUCK_PENDING_MINUTES * 60_000)),
      ),
    )
    .limit(100);
  if (stuck.length) {
    ctx.log.warn("requeueing stuck pending matches", { count: stuck.length });
    await ctx.enqueue(
      "match",
      stuck.map((m) => ({ data: { matchId: m.id }, singletonKey: `match:${m.id}` })),
    );
  }

  return { enqueued: due.length, enabled };
}

/**
 * Mirror active searches' URL lists into search_urls / search_watches and drop
 * watches that no longer apply (URL removed, search paused). A watch that comes
 * back starts over with a fresh baseline, so un-pausing never floods anyone.
 * Returns the ids of URLs with at least one watcher.
 */
async function syncWatches(ctx: Ctx): Promise<number[]> {
  const { db } = ctx;
  const active = await db
    .select({ id: searches.id, urls: searches.urls })
    .from(searches)
    .where(eq(searches.active, true));

  const pairs: { searchId: number; url: string }[] = [];
  for (const s of active) {
    for (const raw of s.urls ?? []) {
      try {
        pairs.push({ searchId: s.id, url: normalizeSearchUrl(raw) });
      } catch {
        ctx.log.warn("skipping unparseable search url", { searchId: s.id, url: raw });
      }
    }
  }

  const urls = [...new Set(pairs.map((p) => p.url))];
  if (urls.length) {
    await db
      .insert(searchUrls)
      // due immediately (explicit, so it's compared on the same clock as ctx.now())
      .values(urls.map((url) => ({ url, nextScrapeAt: new Date(0) })))
      .onConflictDoNothing();
  }
  const urlRows = urls.length
    ? await db.select({ id: searchUrls.id, url: searchUrls.url }).from(searchUrls).where(inArray(searchUrls.url, urls))
    : [];
  const idByUrl = new Map(urlRows.map((r) => [r.url, r.id]));

  const watches = pairs.flatMap((p) => {
    const searchUrlId = idByUrl.get(p.url);
    return searchUrlId ? [{ searchId: p.searchId, searchUrlId }] : [];
  });

  await db.transaction(async (tx) => {
    if (watches.length) await tx.insert(searchWatches).values(watches).onConflictDoNothing();
    // delete every watch not in the current set
    const keep = watches.map((w) => `${w.searchId}:${w.searchUrlId}`);
    await tx
      .delete(searchWatches)
      .where(
        keep.length
          ? notInArray(sql`${searchWatches.searchId}::text || ':' || ${searchWatches.searchUrlId}::text`, keep)
          : sql`true`,
      );
  });

  return [...new Set(watches.map((w) => w.searchUrlId))];
}

async function heartbeat(ctx: Ctx, now: Date) {
  const fields = {
    lastTickAt: now,
    classifierFailures: ctx.failures.count(),
    failOpenAlertsPaused: ctx.failures.tripped(),
    notifyDryRun: ctx.settings.notifyDryRun,
  };
  await ctx.db
    .insert(workerStatus)
    .values({ id: 1, tickCount: 1, ...fields })
    .onConflictDoUpdate({ target: workerStatus.id, set: { ...fields, tickCount: sql`${workerStatus.tickCount} + 1` } });
}
