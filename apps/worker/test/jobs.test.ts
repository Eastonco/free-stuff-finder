import {
  type createDb,
  eq,
  matches,
  notifications,
  posts,
  scraperStatus,
  searches,
  searchUrls,
  searchWatches,
  users,
  workerStatus,
} from "@fsf/db";
import type { Verdict } from "@fsf/engine";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runMatch } from "../src/jobs/match";
import { runNotify } from "../src/jobs/notify";
import { runSchedule } from "../src/jobs/schedule";
import { runScrape } from "../src/jobs/scrape";
import { freshTestDb, resetTables, searchPage, testCtx, testDbName } from "./helpers";

const URL_A = "https://seattle.craigslist.org/search/zip?lat=1";
const final = { retryCount: 3, retryLimit: 3 };
const firstTry = { retryCount: 0, retryLimit: 3 };

describe.skipIf(!testDbName)("worker jobs (Postgres)", () => {
  let conn: ReturnType<typeof createDb>;
  beforeAll(async () => {
    conn = await freshTestDb();
  });
  afterAll(async () => {
    await conn?.sql.end();
  });
  beforeEach(async () => {
    await resetTables(conn.db);
  });

  async function seedSearch(opts: { urls?: string[]; excludeFilters?: string[]; active?: boolean } = {}) {
    const [user] = await conn.db
      .insert(users)
      .values({
        name: "Jo",
        notifyChannel: "ntfy",
        notifyTarget: "jo-topic",
        editToken: crypto.randomUUID(),
        createdAt: "2026-01-01",
      })
      .returning();
    const [search] = await conn.db
      .insert(searches)
      .values({
        userId: user!.id,
        urls: opts.urls ?? [`${URL_A}#search=2~gallery~0`],
        preferencePrompt: "a couch",
        excludeFilters: opts.excludeFilters ?? [],
        active: opts.active ?? true,
        createdAt: "2026-01-01",
      })
      .returning();
    return { user: user!, search: search! };
  }

  /** schedule → scrape the (only) due URL, returning the scrape job's id arg. */
  async function scheduleAndScrape(t: ReturnType<typeof testCtx>) {
    await runSchedule(t.ctx);
    const job = t.enqueued.find((e) => e.queue === "scrape-url");
    expect(job).toBeDefined();
    t.enqueued.length = 0;
    const result = await runScrape(t.ctx, { searchUrlId: job!.data.searchUrlId! });
    // make it due again for the next round
    await conn.db.update(searchUrls).set({ nextScrapeAt: new Date(0) });
    return result;
  }

  it("dedupes URLs across searches, strips fragments, and claims due URLs once", async () => {
    await seedSearch();
    await seedSearch({ urls: [URL_A] });
    const t = testCtx(conn.db);

    await runSchedule(t.ctx);
    expect(t.enqueued).toEqual([{ queue: "scrape-url", data: { searchUrlId: 1 } }]);
    expect(await conn.db.select().from(searchUrls)).toMatchObject([{ url: URL_A }]);
    expect(await conn.db.select().from(searchWatches)).toHaveLength(2);

    t.enqueued.length = 0;
    await runSchedule(t.ctx); // not due yet: claimed by the first tick
    expect(t.enqueued).toEqual([]);
    expect((await conn.db.select().from(workerStatus))[0]).toMatchObject({ tickCount: 2 });
  });

  it("honors the admin kill-switch", async () => {
    await seedSearch();
    await conn.db.insert(scraperStatus).values({ lastCycleAt: "x", cycleCount: 0, scraperEnabled: false });
    const t = testCtx(conn.db);
    expect(await runSchedule(t.ctx)).toEqual({ enqueued: 0, enabled: false });
    expect(t.enqueued).toEqual([]);
  });

  it("baselines the first scrape, then queues only genuinely new posts", async () => {
    const { search } = await seedSearch();
    const page1 = searchPage([
      { id: "p1", title: "Old couch" },
      { id: "p2", title: "Old chair" },
    ]);
    const t = testCtx(conn.db, { pages: { [URL_A]: page1 } });

    expect(await scheduleAndScrape(t)).toEqual({ parsed: 2, newPosts: 2, baselined: 2, queued: 0 });
    expect(t.enqueued).toEqual([]);

    // same page again: nothing new
    expect(await scheduleAndScrape(t)).toMatchObject({ newPosts: 0, queued: 0 });

    // a new post appears
    t.ctx.fetchHtml = async (url) =>
      url === URL_A
        ? searchPage([
            { id: "p3", title: "New couch" },
            { id: "p1", title: "Old couch" },
          ])
        : "";
    expect(await scheduleAndScrape(t)).toMatchObject({ newPosts: 1, queued: 1 });
    const pending = await conn.db.select().from(matches).where(eq(matches.status, "pending"));
    expect(pending).toHaveLength(1);
    expect(t.enqueued).toEqual([{ queue: "match", data: { matchId: pending[0]!.id } }]);
    expect(pending[0]!.searchId).toBe(search.id);
  });

  it("a search added later baselines what's already listed instead of alerting", async () => {
    await seedSearch();
    const page = searchPage([{ id: "p1", title: "Couch" }]);
    const t = testCtx(conn.db, { pages: { [URL_A]: page } });
    await scheduleAndScrape(t);

    await seedSearch({ urls: [URL_A] });
    expect(await scheduleAndScrape(t)).toMatchObject({ baselined: 1, queued: 0 });
  });

  it("tracks parse health on empty pages and fetch errors", async () => {
    await seedSearch();
    const t = testCtx(conn.db, { pages: { [URL_A]: "<html>blocked</html>" } });
    await scheduleAndScrape(t);
    await scheduleAndScrape(t);
    expect((await conn.db.select().from(searchUrls))[0]).toMatchObject({ consecutiveEmpty: 2, lastParsedCount: 0 });

    t.ctx.fetchHtml = async () => {
      throw new Error("ECONNRESET");
    };
    expect(await scheduleAndScrape(t)).toBeNull();
    expect((await conn.db.select().from(searchUrls))[0]?.lastError).toContain("ECONNRESET");
  });

  async function pendingMatch(opts: { excludeFilters?: string[]; title?: string } = {}) {
    const { search } = await seedSearch({ excludeFilters: opts.excludeFilters });
    const [post] = await conn.db
      .insert(posts)
      .values({ sourceId: "p9", link: "https://www.craigslist.org/view/d/x/p9", title: opts.title ?? "Free couch" })
      .returning();
    const [m] = await conn.db
      .insert(matches)
      .values({ searchId: search.id, postId: post!.id, status: "pending" })
      .returning();
    return { matchId: m!.id, postId: post!.id };
  }

  it("classifies with the post page's image + description and queues a notification", async () => {
    const { matchId, postId } = await pendingMatch();
    let seen: unknown;
    const t = testCtx(conn.db, {
      classify: async (input) => {
        seen = input;
        return { label: "want", score: 88, reason: "a couch" };
      },
    });

    expect(await runMatch(t.ctx, { matchId }, firstTry)).toBe("classified:want");
    expect(seen).toMatchObject({
      title: "Free couch",
      imageUrl: "https://images.craigslist.org/00J0J_exampleImage_600x450.jpg",
      preference: "a couch",
    });
    expect((seen as { description: string }).description).toContain("washing machine");
    expect((await conn.db.select().from(posts).where(eq(posts.id, postId)))[0]?.detailFetchedAt).not.toBeNull();
    expect((await conn.db.select().from(matches))[0]).toMatchObject({ status: "classified", label: "want", score: 88 });
    expect(t.enqueued).toEqual([{ queue: "notify", data: { matchId } }]);

    // re-running a decided match is a no-op
    expect(await runMatch(t.ctx, { matchId }, firstTry)).toBe("already decided");
  });

  it("excludes by filter without fetching or classifying", async () => {
    const { matchId } = await pendingMatch({ excludeFilters: ["couch"] });
    const t = testCtx(conn.db, {
      classify: async () => {
        throw new Error("should not classify");
      },
    });
    expect(await runMatch(t.ctx, { matchId }, firstTry)).toBe("excluded:skip");
    expect(t.fetched).toEqual([]);
    expect(t.enqueued).toEqual([]);
  });

  it("retries retryable classifier failures, then fails open — until too many fail", async () => {
    const failOpen: Verdict = {
      label: "want",
      score: 0,
      reason: "unavailable",
      error: { kind: "RateLimitError", retryable: true },
    };
    const t = testCtx(conn.db, { classify: async () => failOpen });

    const { matchId } = await pendingMatch();
    await expect(runMatch(t.ctx, { matchId }, firstTry)).rejects.toThrow(/retrying/);
    expect(await runMatch(t.ctx, { matchId }, final)).toBe("classified:want");
    expect(t.enqueued).toHaveLength(1); // fail-open still alerts while the window is healthy

    // two more failures trip the window (threshold 3): the third is stored but doesn't alert
    for (const id of ["q1", "q2"]) {
      const [p] = await conn.db
        .insert(posts)
        .values({ sourceId: id, link: `https://www.craigslist.org/view/d/x/${id}`, title: "x" })
        .returning();
      const [m] = await conn.db.insert(matches).values({ searchId: 1, postId: p!.id, status: "pending" }).returning();
      await runMatch(t.ctx, { matchId: m!.id }, final);
    }
    expect(t.enqueued).toHaveLength(2);
    const stored = await conn.db.select().from(matches);
    expect(stored.every((m) => m.errorKind === "RateLimitError")).toBe(true);
  });

  it("sends once, records it, and is idempotent", async () => {
    const { matchId } = await pendingMatch();
    const t = testCtx(conn.db);
    await runMatch(t.ctx, { matchId }, firstTry);

    expect(await runNotify(t.ctx, { matchId }, firstTry)).toBe("sent");
    expect(await runNotify(t.ctx, { matchId }, firstTry)).toBe("already sent");
    expect(t.sent).toEqual([{ channel: "ntfy", target: "jo-topic", title: "Free couch" }]);
    expect((await conn.db.select().from(notifications))[0]).toMatchObject({ status: "sent", attempts: 1 });
  });

  it("dry-run records without sending", async () => {
    const { matchId } = await pendingMatch();
    const t = testCtx(conn.db);
    t.ctx.settings.notifyDryRun = true;
    await runMatch(t.ctx, { matchId }, firstTry);
    expect(await runNotify(t.ctx, { matchId }, firstTry)).toBe("dry_run");
    expect(t.sent).toEqual([]);
    expect((await conn.db.select().from(notifications))[0]?.status).toBe("dry_run");
  });

  it("retries retryable send failures and records the final failure", async () => {
    const { matchId } = await pendingMatch();
    const t = testCtx(conn.db, { notify: async () => ({ ok: false, error: "HTTP 503", retryable: true }) });
    await runMatch(t.ctx, { matchId }, firstTry);
    await expect(runNotify(t.ctx, { matchId }, firstTry)).rejects.toThrow(/503/);
    expect(await runNotify(t.ctx, { matchId }, final)).toBe("failed");
    expect((await conn.db.select().from(notifications))[0]).toMatchObject({
      status: "failed",
      attempts: 2,
      error: "HTTP 503",
    });
  });
});
