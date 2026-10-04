import { createDb } from "@fsf/db";

// ponytail: cache the pool across dev hot-reloads so we don't leak connections.
const g = globalThis as unknown as { _fsfDb?: ReturnType<typeof createDb> };
const conn = g._fsfDb ?? createDb({ max: Number(process.env.DB_POOL_MAX ?? 10) });
if (process.env.NODE_ENV !== "production") g._fsfDb = conn;

export const db = conn.db;
