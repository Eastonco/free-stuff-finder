import { type createDb, eq, matches, posts, searches, searchUrls, searchWatches, users, workerStatus } from "@fsf/db";
import { createFailureWindow } from "@fsf/engine";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runSchedule } from "../src/jobs/schedule";
import { freshTestDb, resetTables, testCtx, testDbName } from "./helpers";

const URL_A = "https://seattle.craigslist.org/search/zip?lat=1";
const URL_B = "https://portland.craigslist.org/search/zip";

describe.skipIf(!testDbName)("schedule job (Postgres)", () => {
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

  async function seed(urls: string[], active = true) {
    const [user] = await conn.db
      .insert(users)
      .values({ name: "Jo", notifyChannel: "ntfy", notifyTarget: crypto.randomUUID(), editToken: crypto.randomUUID() })
      .returning();
    const [search] = await conn.db
      .insert(searches)
      .values({ userId: user!.id, urls, preferencePrompt: "a couch", excludeFilters: [], active })
      .returning();
    return search!;
  }
  const watchedUrls = async () =>
    (
      await conn.db
        .select({ url: searchUrls.url })
        .from(searchWatches)
        .innerJoin(searchUrls, eq(searchUrls.id, searchWatches.searchUrlId))
    )
      .map((r) => r.url)
      .sort();

  describe("watch sync", () => {
    it("drops the watch when a search is paused, and restores it when resumed", async () => {
      const s = await seed([URL_A]);
      const t = testCtx(conn.db);
      await runSchedule(t.ctx);
      expect(await watchedUrls()).toEqual([URL_A]);

      await conn.db.update(searches).set({ active: false }).where(eq(searches.id, s.id));
      await runSchedule(t.ctx);
      expect(await watchedUrls()).toEqual([]);

      await conn.db.update(searches).set({ active: true }).where(eq(searches.id, s.id));
      await runSchedule(t.ctx);
      expect(await watchedUrls()).toEqual([URL_A]);
    });

    it("tracks edits to a search's URL list", async () => {
      const s = await seed([URL_A]);
      const t = testCtx(conn.db);
      await runSchedule(t.ctx);
      await conn.db
        .update(searches)
        .set({ urls: [URL_B] })
        .where(eq(searches.id, s.id));
      await runSchedule(t.ctx);
      expect(await watchedUrls()).toEqual([URL_B]);
    });

    it("keeps a shared URL watched until its last watcher goes", async () => {
      const a = await seed([URL_A]);
      await seed([URL_A]);
      const t = testCtx(conn.db);
      await runSchedule(t.ctx);
      await conn.db.update(searches).set({ active: false }).where(eq(searches.id, a.id));
      await runSchedule(t.ctx);
      expect(await watchedUrls()).toEqual([URL_A]);
    });

    it("skips an unparseable URL with a warning and still schedules the rest", async () => {
      await seed(["not a url", URL_B]);
      const warnings: string[] = [];
      const t = testCtx(conn.db, { log: { info() {}, error() {}, warn: (m) => void warnings.push(m) } });
      const res = await runSchedule(t.ctx);
      expect(res.enqueued).toBe(1);
      expect(await watchedUrls()).toEqual([URL_B]);
      expect(warnings).toContain("skipping unparseable search url");
    });

    it("schedules nothing when no search is active", async () => {
      await seed([URL_A], false);
      const t = testCtx(conn.db);
      expect(await runSchedule(t.ctx)).toEqual({ enqueued: 0, enabled: true });
      expect(t.enqueued).toEqual([]);
    });
  });

  describe("claiming", () => {
    it("re-enqueues a URL once its interval has passed", async () => {
      await seed([URL_A]);
      let now = new Date("2026-10-04T12:00:00Z");
      const t = testCtx(conn.db, { now: () => now });
      expect((await runSchedule(t.ctx)).enqueued).toBe(1);

      now = new Date(now.getTime() + 89_000); // interval is 90s
      expect((await runSchedule(t.ctx)).enqueued).toBe(0);
      now = new Date(now.getTime() + 2_000);
      expect((await runSchedule(t.ctx)).enqueued).toBe(1);
    });

    it("uses a per-URL singleton key so a slow scrape can't be queued twice", async () => {
      await seed([URL_A]);
      const jobs: { queue: string; jobs: { singletonKey?: string }[] }[] = [];
      const t = testCtx(conn.db, {
        enqueue: async (queue, j) => void jobs.push({ queue, jobs: j }),
      });
      await runSchedule(t.ctx);
      expect(jobs[0]?.queue).toBe("scrape-url");
      expect(jobs[0]?.jobs[0]?.singletonKey).toMatch(/^url:\d+$/);
    });
  });

  describe("stuck match sweeper", () => {
    async function pendingMatch(searchId: number, createdAt: Date, status = "pending") {
      const [post] = await conn.db
        .insert(posts)
        .values({ sourceId: crypto.randomUUID(), link: "https://x.craigslist.org/1", title: "t" })
        .returning();
      const [m] = await conn.db.insert(matches).values({ searchId, postId: post!.id, status, createdAt }).returning();
      return m!;
    }

    it("requeues pending matches older than 10 minutes, and only those", async () => {
      const s = await seed([URL_A]);
      const now = new Date("2026-10-04T12:00:00Z");
      const stuck = await pendingMatch(s.id, new Date(now.getTime() - 11 * 60_000));
      await pendingMatch(s.id, new Date(now.getTime() - 5 * 60_000)); // still in flight
      await pendingMatch(s.id, new Date(now.getTime() - 60 * 60_000), "done"); // finished

      const t = testCtx(conn.db, { now: () => now });
      await runSchedule(t.ctx);
      expect(t.enqueued.filter((e) => e.queue === "match")).toEqual([{ queue: "match", data: { matchId: stuck.id } }]);
    });

    it("still sweeps while no URL is due", async () => {
      const s = await seed([URL_A]);
      const now = new Date("2026-10-04T12:00:00Z");
      const t = testCtx(conn.db, { now: () => now });
      await runSchedule(t.ctx); // claims the URL
      t.enqueued.length = 0;

      const stuck = await pendingMatch(s.id, new Date(now.getTime() - 30 * 60_000));
      await runSchedule(t.ctx);
      expect(t.enqueued).toEqual([{ queue: "match", data: { matchId: stuck.id } }]);
    });
  });

  describe("heartbeat", () => {
    it("records the tick, dry-run flag and classifier failure state", async () => {
      const failures = createFailureWindow({ windowMs: 60_000, threshold: 2 });
      failures.record();
      failures.record();
      const now = new Date("2026-10-04T12:00:00Z");
      const t = testCtx(conn.db, {
        now: () => now,
        failures,
        settings: { scrapeIntervalSeconds: 90, notifyDryRun: true, emptyParseWarnAfter: 3 },
      });
      await runSchedule(t.ctx);
      expect((await conn.db.select().from(workerStatus))[0]).toMatchObject({
        tickCount: 1,
        lastTickAt: now,
        classifierFailures: 2,
        failOpenAlertsPaused: true,
        notifyDryRun: true,
      });
    });

    it("keeps beating while the kill-switch is off, without touching it", async () => {
      await conn.db.insert(workerStatus).values({ id: 1, enabled: false });
      const t = testCtx(conn.db);
      await runSchedule(t.ctx);
      await runSchedule(t.ctx);
      expect((await conn.db.select().from(workerStatus))[0]).toMatchObject({ enabled: false, tickCount: 2 });
    });

    it("treats a missing status row as enabled", async () => {
      await seed([URL_A]);
      const t = testCtx(conn.db);
      expect((await runSchedule(t.ctx)).enabled).toBe(true);
    });
  });
});
