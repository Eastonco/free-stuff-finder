import { defineConfig } from "drizzle-kit";

import { dbConfigFromEnv } from "./src/env";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: { ...dbConfigFromEnv(), ssl: false },
});
