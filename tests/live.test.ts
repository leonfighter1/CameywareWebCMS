import { expect, it } from "vitest";
import { liveFits } from "@/lib/deploy";

// S8 (the owner, 2026-11-16: no build on each 推到预览站 unless needed): preview's live build takes a release as it is
// when the release has the same code and no page the build lacks; anything else is built once.
it("tells when preview's live build shows a release without a build", () => {
  const built = { key: "abc123:feed", paths: ["/", "/contact/", "/works/"] };
  expect(liveFits(built, "abc123:feed", ["/", "/contact/"])).toBe(true);
  expect(liveFits(built, "abc123:feed", ["/", "/contact/", "/works/"])).toBe(true);
  // A page made since: the build has no file for its address.
  expect(liveFits(built, "abc123:feed", ["/", "/new/"])).toBe(false);
  // The website's main moved, or a built-in template changed.
  expect(liveFits(built, "def456:feed", ["/"])).toBe(false);
  expect(liveFits(built, "abc123:beef", ["/"])).toBe(false);
  // A build of before (no record of what it was made of).
  expect(liveFits(undefined, "abc123:feed", ["/"])).toBe(false);
});
