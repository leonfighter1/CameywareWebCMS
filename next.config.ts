import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// The CMS's editors and its API: a server (unlike the website), since it holds the database. PGlite stays outside the
// bundle (its WebAssembly is loaded from node_modules); uploads may be a few megabytes. Its words: next-intl, the
// language from a cookie (src/i18n/request.ts). TypeScript and Prettier check and lay out a built-in template's code (S6),
// from node_modules too.
const config: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "opencc-js", "typescript", "prettier"],
  experimental: { serverActions: { bodySizeLimit: "8mb" } },
};

export default createNextIntlPlugin()(config);
