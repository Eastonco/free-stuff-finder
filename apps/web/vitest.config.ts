import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Auth/action tests share one Postgres database (TEST_DB_NAME), so files run one at a time.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules", ".next"], fileParallelism: false, hookTimeout: 60_000 },
});
