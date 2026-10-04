import { readFileSync } from "node:fs";

import { createDb, type Db, sql } from "@fsf/db";
import { runMigrations } from "@fsf/db/migrate";
import { createFailureWindow, type Notifier, type Verdict } from "@fsf/engine";

import type { Ctx, Enqueue } from "../src/context";
import type { QueueName } from "../src/queues";

/**
 * Integration tests run against a throwaway database named by TEST_DB_NAME
 * (never the DB_* app database — the defaults point at the live one). The
 * schema is wiped and re-migrated, so the name must contain "test".
 */
export const testDbName = process.env.TEST_DB_NAME;

export async function freshTestDb() {
  if (!testDbName?.includes("test")) throw new Error(`refusing to wipe database "${testDbName}"`);
  const conn = createDb({
    max: 4,
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
    sql`truncate users, searches, listings, reactions, scraper_status, search_urls, search_watches, posts, matches, notifications, worker_status restart identity cascade`,
  );
}

const fixture = (name: string) =>
  readFileSync(new URL(`../../../packages/engine/test/fixtures/${name}`, import.meta.url), "utf8");
export const SEARCH_HTML = fixture("search.html");
export const DETAIL_HTML = fixture("detail.html");

/** A search page listing exactly these (sourceId, title) posts. */
export function searchPage(items: { id: string; title: string }[]): string {
  const lis = items
    .map(
      (i) =>
        `<li class="cl-static-search-result" title="${i.title}"><a href="https://www.craigslist.org/view/d/x/${i.id}"><div class="title">${i.title}</div></a></li>`,
    )
    .join("\n");
  return `<html><body><ol class="cl-static-search-results">${lis}</ol></body></html>`;
}

export type Enqueued = { queue: QueueName; data: Record<string, number> }[];

export function testCtx(db: Db, overrides: Partial<Ctx> & { pages?: Record<string, string> } = {}) {
  const enqueued: Enqueued = [];
  const enqueue: Enqueue = async (queue, jobs) => {
    for (const j of jobs) enqueued.push({ queue, data: j.data as Record<string, number> });
  };
  const pages = overrides.pages ?? {};
  const fetched: string[] = [];
  const sent: { channel: string; target: string; title: string }[] = [];
  const notify: Notifier = async (target, alert) => {
    sent.push({ channel: String(target.channel), target: target.target, title: alert.title });
    return { ok: true };
  };
  const silent = { info: () => {}, warn: () => {}, error: () => {} };

  const ctx: Ctx = {
    db,
    enqueue,
    fetchHtml: async (url) => {
      fetched.push(url);
      const page = pages[url] ?? (url.includes("/view/") ? DETAIL_HTML : undefined);
      if (page === undefined) throw new Error(`no fake page for ${url}`);
      return page;
    },
    classify: async (): Promise<Verdict> => ({ label: "want", score: 80, reason: "looks right" }),
    notify,
    failures: createFailureWindow({ windowMs: 60_000, threshold: 3 }),
    now: () => new Date(),
    log: silent,
    settings: { scrapeIntervalSeconds: 90, notifyDryRun: false, emptyParseWarnAfter: 3 },
    ...overrides,
  };
  return { ctx, enqueued, fetched, sent };
}
