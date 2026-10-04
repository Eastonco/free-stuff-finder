import { defineConfig } from "drizzle-kit";

// Python owns the schema (models.py / init_db). db/schema.ts is a typed mirror.
// Re-generate it from the live DB any time the Python schema changes:
//   docker compose up -d db scraper   # creates/updates tables
//   npm run db:pull
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db",
  dbCredentials: {
    host: process.env.DB_HOST ?? "localhost",
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USER ?? "postgres",
    password: process.env.DB_PASSWORD ?? "postgres",
    database: process.env.DB_NAME ?? "craigslist",
    ssl: false,
  },
});
