import { createDb, loginTokens, sessions, sql, users } from "@fsf/db";
import { runMigrations } from "@fsf/db/migrate";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  consumeLoginToken,
  createSession,
  deleteSession,
  hashToken,
  issueLoginToken,
  LOGIN_LINK_COOLDOWN_SECONDS,
  LOGIN_LINK_MINUTES,
  SESSION_DAYS,
  safeEqual,
  userByEditToken,
  userByNotifyTarget,
  userForSession,
} from "./core";

describe("safeEqual", () => {
  it("compares exactly", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

// Real Postgres, same rules as the worker tests: TEST_DB_NAME must contain "test" (it's wiped).
const testDb = process.env.TEST_DB_NAME;

describe.skipIf(!testDb)("auth core (Postgres)", () => {
  let conn: ReturnType<typeof createDb>;
  let userId: number;
  const t0 = new Date("2026-10-04T12:00:00Z");
  const later = (ms: number) => new Date(t0.getTime() + ms);

  beforeAll(async () => {
    if (!testDb?.includes("test")) throw new Error(`refusing to wipe database "${testDb}"`);
    conn = createDb({
      max: 2,
      host: process.env.TEST_DB_HOST ?? "localhost",
      port: Number(process.env.TEST_DB_PORT ?? 5432),
      user: process.env.TEST_DB_USER ?? "postgres",
      password: process.env.TEST_DB_PASSWORD ?? "postgres",
      database: testDb,
    });
    await conn.db.execute(sql`drop schema if exists drizzle cascade`);
    await conn.db.execute(sql`drop schema public cascade`);
    await conn.db.execute(sql`create schema public`);
    await runMigrations(conn.db);
  });
  afterAll(async () => {
    await conn?.sql.end();
  });
  beforeEach(async () => {
    await conn.db.execute(sql`truncate users, sessions, login_tokens restart identity cascade`);
    const [u] = await conn.db
      .insert(users)
      .values({ name: "Jo", notifyChannel: "ntfy", notifyTarget: "jo-topic", editToken: hashToken("legacy-tok") })
      .returning();
    userId = u!.id;
  });

  it("sessions resolve to their user until they expire or are deleted, and store only a hash", async () => {
    const { token } = await createSession(conn.db, userId, t0);
    expect((await userForSession(conn.db, token, later(1000)))?.id).toBe(userId);
    expect(await userForSession(conn.db, token, later(SESSION_DAYS * 86_400_000 + 1))).toBeNull();
    expect(await userForSession(conn.db, "not-a-token", t0)).toBeNull();

    const [stored] = await conn.db.select().from(sessions);
    expect(stored?.tokenHash).toBe(hashToken(token));
    expect(stored?.tokenHash).not.toContain(token);

    await deleteSession(conn.db, token);
    expect(await userForSession(conn.db, token, later(1000))).toBeNull();
  });

  it("login tokens work once, expire, and respect the cooldown", async () => {
    const token = await issueLoginToken(conn.db, userId, t0);
    expect(token).toBeTruthy();
    // a second request inside the cooldown mints nothing
    expect(await issueLoginToken(conn.db, userId, later(10_000))).toBeNull();

    expect(await consumeLoginToken(conn.db, token!, later(60_000))).toBe(userId);
    expect(await consumeLoginToken(conn.db, token!, later(61_000))).toBeNull(); // already used

    const next = await issueLoginToken(conn.db, userId, later((LOGIN_LINK_COOLDOWN_SECONDS + 1) * 1000));
    expect(next).toBeTruthy();
    expect(await consumeLoginToken(conn.db, next!, later((LOGIN_LINK_MINUTES + 2) * 60_000))).toBeNull(); // expired

    const rows = await conn.db.select().from(loginTokens);
    expect(rows.every((r) => r.tokenHash.length === 64)).toBe(true);
  });

  it("finds users by notify target (trimmed) and by legacy edit token", async () => {
    expect((await userByNotifyTarget(conn.db, "  jo-topic "))?.id).toBe(userId);
    expect(await userByNotifyTarget(conn.db, "")).toBeNull();
    expect(await userByNotifyTarget(conn.db, "someone-else")).toBeNull();
    expect((await userByEditToken(conn.db, "legacy-tok"))?.id).toBe(userId);
  });
});
