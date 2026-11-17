import { expect, it } from "vitest";
import { liveFits } from "@/lib/deploy";

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
