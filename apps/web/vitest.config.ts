import { defineConfig } from "vitest/config";

// Auth tests share one Postgres database (TEST_DB_NAME), so files run one at a time.
export default defineConfig({
  test: { include: ["**/*.test.ts"], exclude: ["node_modules", ".next"], fileParallelism: false, hookTimeout: 60_000 },
});
