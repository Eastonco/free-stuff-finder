import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { type DbConfig, dbConfigFromEnv } from "./env";
import * as schema from "./schema";

export type CreateDbOptions = Partial<DbConfig> & {
  /** Max pooled connections. Web and worker each get their own pool. */
  max?: number;
};

export function createDb(opts: CreateDbOptions = {}) {
  const { max = 10, ...overrides } = opts;
  const sql = postgres({ ...dbConfigFromEnv(), ...overrides, max });
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>["db"];
