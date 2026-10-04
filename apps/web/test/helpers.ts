import { createDb, type Db, searches, sql, users } from "@fsf/db";
import { runMigrations } from "@fsf/db/migrate";

import { hashToken } from "@/lib/auth/core";

/**
 * Integration tests run against a throwaway database named by TEST_DB_NAME
 * (never the DB_* app database). The schema is wiped and re-migrated, so the
 * name must contain "test".
 */
export const testDbName = process.env.TEST_DB_NAME;

export async function freshTestDb() {
  if (!testDbName?.includes("test")) throw new Error(`refusing to wipe database "${testDbName}"`);
  const conn = createDb({
    max: 2,
    host: process.env.TEST_DB_HOST ?? "localhost",
    port: Number(process.env.TEST_DB_PORT ?? 5432),
    user: process.env.TEST_DB_USER ?? "postgres",
    password: process.env.TEST_DB_PASSWORD ?? "postgres",
    database: testDbName,
  });
  await conn.db.execute(sql`drop schema if exists drizzle cascade`);
  await conn.db.execute(sql`drop schema public cascade`);
  await conn.db.execute(sql`create schema public`);
  await runMigrations(conn.db);
  return conn;
}

export async function resetTables(db: Db) {
  await db.execute(
    sql`truncate users, searches, search_urls, search_watches, posts, matches, notifications, sessions, login_tokens, worker_status restart identity cascade`,
  );
}

export async function seedUser(db: Db, opts: { name?: string; target?: string; isAdmin?: boolean } = {}) {
  const target = opts.target ?? `topic-${crypto.randomUUID().slice(0, 8)}`;
  const [user] = await db
    .insert(users)
    .values({
      name: opts.name ?? "Jo",
      notifyChannel: "ntfy",
      notifyTarget: target,
      editToken: hashToken(crypto.randomUUID()),
      isAdmin: opts.isAdmin ?? false,
    })
    .returning();
  return user!;
}

export async function seedSearch(db: Db, userId: number, opts: { prompt?: string; active?: boolean } = {}) {
  const [search] = await db
    .insert(searches)
    .values({
      userId,
      urls: ["https://seattle.craigslist.org/search/zip"],
      preferencePrompt: opts.prompt ?? "a couch",
      excludeFilters: [],
      active: opts.active ?? true,
    })
    .returning();
  return search!;
}

export function form(values: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}
