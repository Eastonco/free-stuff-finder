import { type createDb, searchUrls, workerStatus } from "@fsf/db";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { freshTestDb, resetTables, testDbName } from "@/test/helpers";

const h = vi.hoisted(() => ({ db: undefined as unknown, isAdmin: false }));

vi.mock("@/db", () => ({
  get db() {
    return h.db;
  },
}));
// Mirrors the real guard: non-admins hit notFound() before any write.
vi.mock("@/lib/auth/session", () => ({
  requireAdmin: async () => {
    if (!h.isAdmin) throw new Error("NOT_FOUND");
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { scrapeNow, setScraperEnabled } from "./actions";

describe.skipIf(!testDbName)("admin actions (Postgres)", () => {
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
    h.isAdmin = false;
  });

  const enabled = async () => (await conn.db.select().from(workerStatus))[0]?.enabled;

  it("setScraperEnabled flips the kill-switch, creating the status row if needed", async () => {
    h.isAdmin = true;
    await setScraperEnabled(false);
    expect(await enabled()).toBe(false);
    await setScraperEnabled(true);
    expect(await enabled()).toBe(true);
    expect(await conn.db.select().from(workerStatus)).toHaveLength(1);
  });

  it("scrapeNow marks every URL due", async () => {
    h.isAdmin = true;
    const future = new Date(Date.now() + 3_600_000);
    await conn.db.insert(searchUrls).values([
      { url: "https://a.craigslist.org/search/zip", nextScrapeAt: future },
      { url: "https://b.craigslist.org/search/zip", nextScrapeAt: future },
    ]);
    await scrapeNow();
    const rows = await conn.db.select().from(searchUrls);
    expect(rows.every((r) => r.nextScrapeAt.getTime() === 0)).toBe(true);
  });

  it("refuses non-admins before touching anything", async () => {
    const future = new Date(Date.now() + 3_600_000);
    await conn.db.insert(searchUrls).values({ url: "https://a.craigslist.org/search/zip", nextScrapeAt: future });

    await expect(setScraperEnabled(false)).rejects.toThrow("NOT_FOUND");
    await expect(scrapeNow()).rejects.toThrow("NOT_FOUND");

    expect(await conn.db.select().from(workerStatus)).toHaveLength(0);
    expect((await conn.db.select().from(searchUrls))[0]?.nextScrapeAt).toEqual(future);
  });
});
