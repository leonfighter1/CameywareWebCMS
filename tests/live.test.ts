import { expect, it } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cmsSiteState, liveFits } from "@/lib/deploy";

// S8 (the owner, 2026-11-16: no build on each 推到预览站 unless needed): preview's live build takes a release as it is
// when the release has the same code and the same pages; anything else is built once.
it("tells when preview's live build shows a release without a build", () => {
  const built = { key: "abc123:feed", paths: ["/", "/contact/", "/works/"] };
  expect(liveFits(built, "abc123:feed", ["/", "/contact/", "/works/"])).toBe(true);
  expect(liveFits(built, "abc123:feed", ["/works/", "/", "/contact/"])).toBe(true);
  // A page made since: the build has no file for its address.
  expect(liveFits(built, "abc123:feed", ["/", "/contact/", "/works/", "/new/"])).toBe(false);
  expect(liveFits(built, "abc123:feed", ["/", "/new/"])).toBe(false);
  // A page gone since (the owner: /test/ discarded, still on preview): its file would keep showing it as built.
  expect(liveFits(built, "abc123:feed", ["/", "/contact/"])).toBe(false);
  // The website's main moved, or a built-in template changed.
  expect(liveFits(built, "def456:feed", ["/", "/contact/", "/works/"])).toBe(false);
  expect(liveFits(built, "abc123:beef", ["/", "/contact/", "/works/"])).toBe(false);
  // A build of before (no record of what it was made of).
  expect(liveFits(undefined, "abc123:feed", ["/"])).toBe(false);
});

// The owner, 2026-11-17: 重建 CMS 预览站 seemed to do nothing. Its pages show when the CMS's preview was built.
it("says when the CMS's preview was built", () => {
  const dir = mkdtempSync(join(tmpdir(), "cms-site-"));
  const before = process.env.CMS_DEPLOY_DIR;
  process.env.CMS_DEPLOY_DIR = dir;
  try {
    expect(cmsSiteState()).toEqual({ building: false, failed: undefined, at: undefined });
    mkdirSync(join(dir, "cms", "site"), { recursive: true });
    writeFileSync(join(dir, "cms", "site", "index.html"), "<html></html>");
    expect(cmsSiteState().at).toBeInstanceOf(Date);
  } finally {
    if (before === undefined) delete process.env.CMS_DEPLOY_DIR;
    else process.env.CMS_DEPLOY_DIR = before;
    rmSync(dir, { recursive: true, force: true });
  }
});
