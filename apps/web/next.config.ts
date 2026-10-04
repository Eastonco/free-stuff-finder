import path from "node:path";
import type { NextConfig } from "next";

// standalone: small runtime image — Docker copies .next/standalone + static.
// Tracing root is the monorepo root so workspace packages get bundled in.
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default config;
