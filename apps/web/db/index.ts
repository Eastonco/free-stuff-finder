import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Same env vars / defaults as the Python side (db.py).
function connect() {
  return postgres({
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_NAME ?? "craigslist",
  });
}

// ponytail: cache the pool across dev hot-reloads so we don't leak connections.
const g = globalThis as unknown as { _sql?: ReturnType<typeof connect> };
const sql = g._sql ?? connect();
if (process.env.NODE_ENV !== "production") g._sql = sql;

export const db = drizzle(sql, { schema });
