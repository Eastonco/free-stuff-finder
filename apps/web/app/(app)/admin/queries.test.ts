import { type createDb, matches, posts } from "@fsf/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { freshTestDb, resetTables, seedSearch, seedUser, testDbName } from "@/test/helpers";

const h = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("@/db", () => ({
  get db() {
    return h.db;
  },
}));

import { getOverview, getStatus, statsBySearch } from "./queries";

describe.skipIf(!testDbName)("admin queries (Postgres)", () => {
  let conn: ReturnType<typeof createDb>;
  beforeAll(async () => {
    conn = await freshTestDb();
    h.db = conn.db;
  });
  afterAll(async () => {
    await conn?.sql.end();
  });
  beforeEach(async () => {
    await resetTables(conn.db);
  });

  async function seedMatches(searchId: number, labels: (string | null)[]) {
    let n = 0;
    for (const label of labels) {
      const [post] = await conn.db
        .insert(posts)
        .values({ sourceId: `${searchId}-${n++}`, link: "https://x.craigslist.org/1", title: "t" })
        .returning();
      await conn.db.insert(matches).values({ searchId, postId: post!.id, label, status: "done" });
    }
  }

  it("statsBySearch counts per search in one query, and omits searches with no matches", async () => {
    const u = await seedUser(conn.db);
    const a = await seedSearch(conn.db, u.id);
    const b = await seedSearch(conn.db, u.id);
    const empty = await seedSearch(conn.db, u.id);
    await seedMatches(a.id, ["want", "skip", "want", null]);
    await seedMatches(b.id, ["skip"]);

    const stats = await statsBySearch([a.id, b.id, empty.id]);
    expect(stats.get(a.id)).toMatchObject({ total: 4, wants: 2 });
    expect(stats.get(a.id)?.last).toBeTruthy();
    expect(stats.get(b.id)).toMatchObject({ total: 1, wants: 0 });
    expect(stats.has(empty.id)).toBe(false);
    expect((await statsBySearch([])).size).toBe(0);
  });

  it("getOverview totals users, searches and labels (null label = baseline)", async () => {
    const u = await seedUser(conn.db);
    const s = await seedSearch(conn.db, u.id);
    await seedMatches(s.id, ["want", "skip", "skip", null]);
    expect(await getOverview()).toMatchObject({ users: 1, searches: 1, listings: 4, want: 1, skip: 2, baseline: 1 });
  });

  it("getStatus is null before the worker has ever ticked", async () => {
    expect(await getStatus()).toBeNull();
  });
});
