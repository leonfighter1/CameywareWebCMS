import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { freshDb } from "@/lib/db";
import { deploy } from "@/lib/deploy";
import { siteRepo } from "@/lib/paths";
import { seedIfEmpty } from "@/lib/seed";
import { environments } from "@/lib/workflow";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
let root = "";

afterEach(() => {
  delete process.env.SITE_REPO;
  if (root) rmSync(root, { recursive: true, force: true });
});

it("推到正式站 pushes content/site.json alone on top of GitHub's main; local commits stay local", async () => {
  // GitHub stand-in: a bare repository, and the website's clone of it with a commit of code not pushed yet.
  root = mkdtempSync(join(tmpdir(), "cms-publish-test-"));
  const origin = join(root, "origin.git");
  const site = join(root, "site");
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", origin, site);
  git(site, "config", "user.email", "test@example.com");
  git(site, "config", "user.name", "test");
  mkdirSync(join(site, "content"));
  writeFileSync(join(site, "content", "site.json"), "{}\n");
  git(site, "add", ".");
  git(site, "commit", "-m", "start");
  git(site, "push", "origin", "HEAD:main");
  writeFileSync(join(site, "code.txt"), "not pushed yet");
  git(site, "add", ".");
  git(site, "commit", "-m", "local code");

  const pg = await freshDb();
  await seedIfEmpty(pg, siteRepo());
  process.env.SITE_REPO = site;
  const { done } = await deploy("production", 1, "tester");
  await done;

  expect(git(origin, "log", "--format=%s", "main").split("\n")).toEqual([
    "Content: release 1 (tester)",
    "start",
  ]);
  const published = JSON.parse(git(origin, "show", "main:content/site.json")) as {
    environment: string;
    release: { id: number };
    pages: unknown[];
  };
  expect([published.environment, published.release.id, published.pages.length]).toEqual(["production", 1, 6]);
  expect(git(site, "log", "-1", "--format=%s")).toBe("local code");
  expect(git(site, "worktree", "list").split("\n")).toHaveLength(1);
  expect((await environments(pg)).production.release).toBe(1);
});
