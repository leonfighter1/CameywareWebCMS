import type { NextConfig } from "next";

// The CMS's editors and its API: a server (unlike the website), since it holds the database. PGlite stays outside the
// bundle (its WebAssembly is loaded from node_modules); uploads may be a few megabytes.
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "opencc-js"],
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default config;
