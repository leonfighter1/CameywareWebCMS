import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { checkout, CODE_BRANCH, codeChanges, inTree } from "@/lib/code";
import { freshDb } from "@/lib/db";
import { codeToProduction } from "@/lib/deploy";
import { fileState, take } from "@/lib/files";
import { siteRepo } from "@/lib/paths";
import { createRelease } from "@/lib/releases";
import { addCodeFiles, seedIfEmpty } from "@/lib/seed";
import { codeProblems, getCode, OVERLAYS, revisionsAt, saveCode } from "@/lib/store";
import { CmsError } from "@/lib/words";
import { checkIn, toPreview } from "@/lib/workflow";

const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
const CODE = "src/cms/views/image.tsx";
/** A built-in template of the image type, as Prettier lays it out (saveCode lays out what it takes). */
const VIEW = (word: string) =>
  `"use client";\n\nexport default function ImageView() {\n  return <p>${word}</p>;\n}\n`;
const IMAGE = [{ kind: "code" as const, id: "image" }];
const quiet = () => {};
let root = "";

afterEach(() => {
  delete process.env.SITE_REPO;
  delete process.env.CMS_SITE_TREE;
  if (root) rmSync(root, { recursive: true, force: true });
});

/** GitHub (a bare repository) and the website's clone of it, its image view at "one"; the CMS seeded and pointed at it. */
async function setUp() {
  root = mkdtempSync(join(tmpdir(), "cms-code-test-"));
  const origin = join(root, "origin.git");
  const site = join(root, "site");
  git(root, "init", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, site);
  // An empty clone's branch is git's default name: the website's is main (the CMS reads main).
  git(site, "checkout", "-q", "-b", "main");
  git(site, "config", "user.email", "test@example.com");
  git(site, "config", "user.name", "test");
  mkdirSync(join(site, "src", "cms", "views"), { recursive: true });
  mkdirSync(join(site, "content"));
  writeFileSync(join(site, "content", "site.json"), "{}\n");
  writeFileSync(join(site, CODE), VIEW("one"));
  git(site, "add", ".");
  git(site, "commit", "-m", "start");
  git(site, "push", "origin", "HEAD:main");
  const pg = await freshDb();
  await seedIfEmpty(pg, siteRepo());
  process.env.SITE_REPO = site;
  process.env.CMS_SITE_TREE = join(root, "tree");
  return { pg, origin, site };
}

/** The developer's own commit of the image view at [word] on the website's main. */
function commitCode(site: string, word: string) {
  writeFileSync(join(site, CODE), VIEW(word));
  git(site, "commit", "-q", "-am", word);
}

it("takes the built-in templates in from the website's main, and the code's changes to one nobody holds (S6)", async () => {
  const { pg, site } = await setUp();
  expect(await addCodeFiles(pg, site)).toEqual(["image"]);
  expect((await fileState(pg, "code", "image"))!.status).toBe("available");
  expect((await getCode(pg, "image"))!.source).toBe(VIEW("one"));
  commitCode(site, "two");
  expect(await addCodeFiles(pg, site)).toEqual(["image"]);
  expect((await getCode(pg, "image"))!.source).toBe(VIEW("two"));
  expect(await addCodeFiles(pg, site)).toEqual([]);
  // main back at a text the CMS had (behind the CMS): not a change of the code's.
  commitCode(site, "one");
  expect(await addCodeFiles(pg, site)).toEqual([]);
  // Someone's file waits: the code's change comes in once it is free again.
  commitCode(site, "three");
  await take(pg, IMAGE, "lee");
  expect(await addCodeFiles(pg, site)).toEqual([]);
  expect((await getCode(pg, "image"))!.source).toBe(VIEW("two"));
});

it("checks an upload by the website's rules and lays it out as its code is", async () => {
  const { pg, site } = await setUp();
  await addCodeFiles(pg, site);
  expect(codeProblems("image", `"use client";\nexport default function X() { return <script />; }`)).toEqual([
    { key: "codeCheck.element", values: { tag: "<script>", line: 2 } },
  ]);
  await expect(saveCode(pg, "image", VIEW("x"), "lee")).rejects.toThrow(CmsError);
  await take(pg, IMAGE, "lee");
  await expect(saveCode(pg, "image", `import fs from "node:fs";`, "lee")).rejects.toThrow(CmsError);
  await saveCode(
    pg,
    "image",
    `"use client";\nexport default function ImageView() { return <p>new</p> }`,
    "lee",
  );
  expect((await getCode(pg, "image"))!.source).toBe(
    `"use client";\nexport default function ImageView() {\n  return <p>new</p>;\n}\n`,
  );
});

it("puts a checked-in built-in template on cms-preview, then on GitHub's main with the content", async () => {
  const { pg, origin, site } = await setUp();
  commitCode(site, "two");
  git(site, "push", "-q", "origin", "HEAD:main");
  await addCodeFiles(pg, site);
  await take(pg, IMAGE, "lee");
  await saveCode(pg, "image", VIEW("three"), "lee");
  await checkIn(pg, IMAGE, "三", "lee");

  const files = await codeChanges(pg, await revisionsAt(pg, OVERLAYS.workflow), "main");
  expect(files.map((f) => [f.path, f.text])).toEqual([[CODE, VIEW("three")]]);
  await inTree((dir) => checkout(dir, "main", files, quiet, CODE_BRANCH), quiet);
  expect(git(site, "show", `${CODE_BRANCH}:${CODE}`)).toBe(VIEW("three").trim());
  expect(git(site, "log", "--format=%s", "-2", CODE_BRANCH).split("\n")).toEqual([
    `Code: ${CODE} (CMS version ${files[0]!.revision})`,
    "two",
  ]);
  // The developer's own checkout stays as it was.
  expect(readFileSync(join(site, CODE), "utf8")).toBe(VIEW("two"));
  expect(git(site, "status", "--porcelain")).toBe("");

  await (
    await toPreview(pg, IMAGE, "lee", "", async () => {})
  ).done;
  const release = await createRelease(pg, "lee", "", (f) => f.stage === "preview");
  git(site, "fetch", "-q", "origin", "main");
  const out = await codeChanges(pg, await revisionsAt(pg, OVERLAYS.preview), "origin/main");
  await codeToProduction(pg, release, "lee", out, quiet, async () => {});
  expect(git(origin, "log", "--format=%s", "-1", "main")).toBe(`Content and code: release ${release} (lee)`);
  expect(git(origin, "show", `main:${CODE}`)).toBe(VIEW("three").trim());
  expect(
    (JSON.parse(git(origin, "show", "main:content/site.json")) as { environment: string }).environment,
  ).toBe("production");
  // The checkout is back on cms-preview, what preview shows.
  expect(git(join(root, "tree"), "rev-parse", "--abbrev-ref", "HEAD")).toBe(CODE_BRANCH);
});

it("refuses a file in the workflow whose code main changed meanwhile, or that a ref lacks", async () => {
  const { pg, site } = await setUp();
  await addCodeFiles(pg, site);
  await take(pg, IMAGE, "lee");
  await saveCode(pg, "image", VIEW("mine"), "lee");
  await checkIn(pg, IMAGE, "我的", "lee");
  commitCode(site, "theirs");
  expect(await addCodeFiles(pg, site)).toEqual([]);
  const workflow = await revisionsAt(pg, OVERLAYS.workflow);
  const refusal = await codeChanges(pg, workflow, "main").catch((e: CmsError) => e);
  expect(refusal).toBeInstanceOf(CmsError);
  expect([(refusal as CmsError).msg.key, ((refusal as CmsError).details[0] as { key: string }).key]).toEqual([
    "errors.codeConflict",
    "errors.codeChanged",
  ]);
  // The CMS's own preview leaves it out instead.
  expect(await codeChanges(pg, workflow, "main", { lenient: true })).toEqual([]);
  const missing = await codeChanges(pg, workflow, "no-such-branch").catch((e: CmsError) => e);
  expect(((missing as CmsError).details[0] as { key: string }).key).toBe("errors.codeMissing");
});
