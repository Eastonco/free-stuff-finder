import path from "node:path";
import type { NextConfig } from "next";

// standalone: small runtime image — Docker copies .next/standalone + static.
// Tracing root is the monorepo root so workspace packages get bundled in.
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // workspace packages ship TypeScript source, not built JS
  transpilePackages: ["@fsf/db", "@fsf/engine"],
};

export default config;
