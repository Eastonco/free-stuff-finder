// Migration 0004 copies the Python scraper's `listings` into posts/matches so the
// worker never re-alerts on something Python already judged. Runs the real SQL.
import { readFileSync } from "node:fs";

import { type createDb, eq, listings, matches, posts, searches, sql, users } from "@fsf/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { runScrape } from "../src/jobs/scrape";
import { freshTestDb, resetTables, searchPage, testCtx, testDbName } from "./helpers";

const BACKFILL = readFileSync(
  new URL("../../../packages/db/migrations/0004_backfill_from_listings.sql", import.meta.url),
  "utf8",
)
  .split("--> statement-breakpoint")
  .map((s) => s.trim())
  .filter(Boolean);

const URL_A = "https://seattle.craigslist.org/search/zip?lat=1";
const URL_B = "https://seattle.craigslist.org/search/zip?lat=2";

describe.skipIf(!testDbName)("cutover backfill (Postgres)", () => {
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

  const runBackfill = async () => {
    for (const stmt of BACKFILL) await conn.db.execute(sql.raw(stmt));
  };

  async function seed() {
    const [u] = await conn.db
      .insert(users)
      .values({ name: "Jo", notifyChannel: "ntfy", notifyTarget: "jo", editToken: "t" })
      .returning();
    const mk = async (url: string) =>
      (
        await conn.db
          .insert(searches)
          .values({
            userId: u!.id,
            urls: [url],
            preferencePrompt: "p",
            excludeFilters: [],
            active: true,
          })
          .returning()
      )[0]!;
    const s1 = await mk(URL_A);
    const s2 = await mk(URL_B); // a different area that also listed p2
    const row = (searchId: number, clId: string, label: string | null, reason: string, at: string) => ({
      searchId,
      clId,
      link: `https://www.craigslist.org/view/d/x/${clId}`,
      title: `Post ${clId}`,
      imageUrl: null,
      aiLabel: label,
      aiScore: label ? 50 : null,
      aiReason: reason,
      timePosted: "1 hr ago",
      location: clId === "p1" ? "" : "Ballard",
      timeScraped: at,
    });
    await conn.db.insert(listings).values([
      row(s1.id, "p1", null, "backfill", "2026-10-01 10:00:00"),
      row(s1.id, "p2", "want", "looks right", "2026-10-02 10:00:00"),
      row(s1.id, "p3", "want", "classification unavailable (BadRequestError)", "2026-10-02 11:00:00"),
      row(s1.id, "p4", "skip", "excluded by filter", "2026-10-02 12:00:00"),
      row(s2.id, "p2", "skip", "not for me", "2026-10-03 09:00:00"), // same post, other search, seen later
    ]);
    return { s1, s2 };
  }

  it("copies every verdict, maps statuses, and keeps the earliest sighting", async () => {
    const { s1, s2 } = await seed();
    await runBackfill();

    expect(await conn.db.select().from(posts)).toHaveLength(4); // p1..p4, p2 once
    const [p2] = await conn.db.select().from(posts).where(eq(posts.sourceId, "p2"));
    expect(p2?.firstSeenAt.toISOString()).toBe("2026-10-02T10:00:00.000Z");
    const [p1] = await conn.db.select().from(posts).where(eq(posts.sourceId, "p1"));
    expect(p1?.location).toBeNull();

    const rows = await conn.db
      .select({
        searchId: matches.searchId,
        sourceId: posts.sourceId,
        status: matches.status,
        label: matches.label,
        errorKind: matches.errorKind,
      })
      .from(matches)
      .innerJoin(posts, eq(posts.id, matches.postId));
    const by = (sid: number, id: string) => rows.find((r) => r.searchId === sid && r.sourceId === id);
    expect(rows).toHaveLength(5);
    expect(by(s1.id, "p1")).toMatchObject({ status: "baseline", label: null });
    expect(by(s1.id, "p2")).toMatchObject({ status: "classified", label: "want", errorKind: null });
    expect(by(s1.id, "p3")).toMatchObject({ status: "classified", label: "want", errorKind: "BadRequestError" });
    expect(by(s1.id, "p4")).toMatchObject({ status: "excluded", label: "skip" });
    expect(by(s2.id, "p2")).toMatchObject({ status: "classified", label: "skip" });
  });

  it("is idempotent and never overwrites what the worker already recorded", async () => {
    const { s1 } = await seed();
    const [own] = await conn.db
      .insert(posts)
      .values({ sourceId: "p2", link: "https://www.craigslist.org/view/d/x/p2", title: "Worker's title" })
      .returning();
    await conn.db
      .insert(matches)
      .values({ searchId: s1.id, postId: own!.id, status: "classified", label: "skip", reason: "worker verdict" });

    await runBackfill();
    await runBackfill();

    expect(await conn.db.select().from(posts)).toHaveLength(4);
    expect(await conn.db.select().from(matches)).toHaveLength(5);
    const [kept] = await conn.db.select().from(matches).where(eq(matches.postId, own!.id));
    expect(kept).toMatchObject({ label: "skip", reason: "worker verdict" });
  });

  it("stops the worker re-alerting on posts Python already judged", async () => {
    await seed();
    await runBackfill();
    const t = testCtx(conn.db, {
      pages: { [URL_A]: searchPage(["p1", "p2", "p3", "p4"].map((id) => ({ id, title: `Post ${id}` }))) },
    });
    const { runSchedule } = await import("../src/jobs/schedule");
    await runSchedule(t.ctx);
    // first worker scrape of a watch is a baseline anyway; make the watches established
    await conn.db.execute(sql`update search_watches set baselined_at = now()`);
    const [urlA] = await conn.db.execute<{ id: number }>(sql`select id from search_urls where url = ${URL_A}`);
    const result = await runScrape(t.ctx, { searchUrlId: urlA!.id });
    expect(result).toMatchObject({ newPosts: 0, queued: 0 });
  });
});
