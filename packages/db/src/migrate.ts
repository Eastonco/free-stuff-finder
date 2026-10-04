// Applies pending migrations from ./migrations. Run: pnpm --filter @fsf/db db:migrate
//
// Baseline: DBs created before migrations existed (by SQLAlchemy create_all)
// already have the tables migration 0000 would create. If we find the `users`
// table but no migration journal, we record 0000 as applied instead of running it.
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { createDb, type Db } from "./client";

const MIGRATIONS_FOLDER = path.join(path.dirname(fileURLToPath(import.meta.url)), "../migrations");

async function baselineLegacyDb(db: Db) {
  const [legacy] = await db.execute<{ exists: boolean }>(sql`select to_regclass('public.users') is not null as exists`);
  const [journal] = await db.execute<{ exists: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as exists`,
  );
  if (!legacy?.exists || journal?.exists) return;

  const [first] = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER });
  if (!first) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`create schema if not exists drizzle`);
    await tx.execute(sql`create table if not exists drizzle.__drizzle_migrations (
      id serial primary key, hash text not null, created_at bigint)`);
    await tx.execute(
      sql`insert into drizzle.__drizzle_migrations (hash, created_at) values (${first.hash}, ${first.folderMillis})`,
    );
  });
  console.log("baselined legacy schema: marked migration 0000 as applied");
}

export async function runMigrations(db: Db) {
  await baselineLegacyDb(db);
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { db, sql: client } = createDb({ max: 1 });
  try {
    await runMigrations(db);
    console.log("migrations up to date");
  } finally {
    await client.end();
  }
}
