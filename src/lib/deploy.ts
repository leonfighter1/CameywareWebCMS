/**
 * Sending a release out (workflow.ts). Each runs in the CMS's server process after the request that began it, writing
 * its log to the deployment as it goes.
 *
 *   preview     the release → deploy/preview/content.json; the website built with it (CMS_CONTENT) in the CMS's checkout
 *               of the website (code.ts), on the branch cms-preview: main with a commit for each built-in template the
 *               release has otherwise (S6). Built in a folder of its own (NEXT_DIST_DIR=.cms-build/preview), then
 *               swapped into the folder 禄命秘解's server serves as preview.cameyware.com (the website's out/). A failed
 *               build leaves preview as it was. 禄命秘解's npm run all builds the same file on the same branch, so a
 *               restart there keeps it.
 *   production  the release → content/site.json, committed alone on top of GitHub's main from a worktree of its own and
 *               pushed (C2); Cloudflare Pages builds www.cameyware.com from it. A developer's commits not pushed yet
 *               stay where they are. A release that changes a built-in template: the files with content/site.json on
 *               GitHub's main in the CMS's checkout, linted and built there first, then committed together and pushed.
 *   cms         the website built in CMS mode (NEXT_PUBLIC_CMS=on), on main with the built-in templates in the workflow,
 *               into deploy/cms/site, which the CMS's preview server serves: after the website's code changes and when a
 *               built-in template comes into the workflow or leaves it, never after content (that comes live).
 */
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  checkout,
  CODE_BRANCH,
  type CodeFile,
  codeChanges,
  codeLine,
  inTree,
  lintCode,
  treeEnv,
} from "./code";
import { db } from "./db";
import type { Item } from "./files";
import { git, run } from "./git";
import { deployDir, siteRepo } from "./paths";
import {
  type Action,
  appendLog,
  beginDeployment,
  type Env,
  finishDeployment,
  logLine,
  markDeployed,
  releaseContent,
  releaseManifest,
} from "./releases";
import { buildContent, OVERLAYS, revisionsAt, revisionsById } from "./store";
import { CmsError } from "./words";

const win = process.platform === "win32";

/** Renames [from] to [to], a few times over: on Windows a folder being read is briefly locked. */
async function renameRetrying(from: string, to: string) {
  for (let i = 0; ; i++) {
    try {
      return renameSync(from, to);
    } catch (e) {
      if (i >= 20) throw e;
      await new Promise((r) => setTimeout(r, 250));
    }
  }
}

/** The website in [dir] (the CMS's checkout of it) built with [content] into [distDir] there, [env] on top. */
async function buildSite(
  dir: string,
  contentFile: string,
  distDir: string,
  env: Record<string, string>,
  log: (s: string) => void,
) {
  rmSync(join(dir, distDir), { recursive: true, force: true });
  log(`npx next build (CMS_CONTENT=${contentFile}, NEXT_DIST_DIR=${distDir})\n`);
  const code = await run(
    win ? "npx.cmd" : "npx",
    ["next", "build"],
    dir,
    { CMS_CONTENT: contentFile, NEXT_DIST_DIR: distDir, ...treeEnv(), ...env },
    log,
    win,
  );
  if (code !== 0 || !existsSync(join(dir, distDir, "index.html")))
    throw new Error(`website build failed (${code})`);
}

/** A release's built-in templates (S6): their versions, by `code:<type>`. */
async function releaseCode(pg: Pg, release: number) {
  const manifest = await releaseManifest(pg, release).catch(() => ({}) as Record<string, number>);
  return revisionsById(
    pg,
    Object.entries(manifest).flatMap(([k, id]) => (k.startsWith("code:") ? [id] : [])),
  );
}

type Pg = Awaited<ReturnType<typeof db>>;

/** A release's content as [env] carries it: its environment and the release it is. */
async function contentFor(pg: Pg, release: number, env: Env, by: string) {
  const content = await releaseContent(pg, release);
  return { ...content, environment: env, release: { id: release, at: new Date().toISOString(), by } };
}

async function toPreview(pg: Pg, release: number, by: string, log: (s: string) => void) {
  const content = await contentFor(pg, release, "preview", by);
  const file = deployDir("preview", "content.json");
  mkdirSync(deployDir("preview"), { recursive: true });
  writeFileSync(file, JSON.stringify(content, null, 2) + "\n");
  const code = await codeChanges(pg, await releaseCode(pg, release), "main");
  await inTree(async (dir) => {
    await checkout(dir, "main", code, log, CODE_BRANCH);
    await lintCode(
      dir,
      code.map((f) => f.path),
      log,
    );
    await buildSite(dir, file, ".cms-build/preview", {}, log);
    const out = join(siteRepo(), "out");
    const old = join(siteRepo(), `out.old-${Date.now()}`);
    if (existsSync(out)) await renameRetrying(out, old);
    await renameRetrying(join(dir, ".cms-build", "preview"), out);
    rmSync(old, { recursive: true, force: true });
  }, log);
  log(logLine("deploy.previewDone"));
}

/** What a release with built-in templates passes before it is pushed: the website's lint on them, and its build. */
type Checks = (dir: string, paths: string[], contentFile: string, log: (s: string) => void) => Promise<void>;
const lintAndBuild: Checks = async (dir, paths, contentFile, log) => {
  await lintCode(dir, paths, log);
  await buildSite(dir, contentFile, ".cms-build/check", {}, log);
  rmSync(join(dir, ".cms-build", "check"), { recursive: true, force: true });
};

/**
 * A release that changes built-in templates (S6): on GitHub's main in the CMS's checkout, the files and content/site.json
 * written, linted and built (a file that breaks the build never reaches GitHub), then committed together and pushed.
 * [checks] are for tests (a bare repository has no website to build).
 */
export async function codeToProduction(
  pg: Pg,
  release: number,
  by: string,
  code: CodeFile[],
  log: (s: string) => void,
  checks: Checks = lintAndBuild,
) {
  await inTree(async (dir) => {
    await checkout(dir, "origin/main", code, log);
    const file = join(dir, "content", "site.json");
    writeFileSync(file, JSON.stringify(await contentFor(pg, release, "production", by), null, 2) + "\n");
    const paths = code.map((f) => f.path);
    await checks(dir, paths, file, log);
    await git(["add", "--", "content/site.json", ...paths], log, dir);
    const message = [`Content and code: release ${release} (${by})`, "", ...code.map(codeLine)].join("\n");
    await git(["commit", "-q", "-m", message, "--", "content/site.json", ...paths], log, dir);
    await git(["push", "origin", "HEAD:main"], log, dir);
  }, log);
  log(logLine("deploy.productionDone"));
}

/**
 * The release as content/site.json on top of GitHub's main, from a worktree of its own (a temporary folder checked out at
 * origin/main): the commit holds that file alone and is pushed as it is, so a developer's commits not pushed yet in the
 * website's repository never go out with it, nor block it. That repository is one commit behind GitHub afterwards; its
 * next push fetches it first, as git asks. One that changes built-in templates goes through codeToProduction; a
 * rollback ([code] false) sends the content alone: the built-in templates stay as production has them.
 */
async function toProduction(pg: Pg, release: number, by: string, log: (s: string) => void, code = true) {
  await git(["fetch", "origin", "main"], log);
  const files = code ? await codeChanges(pg, await releaseCode(pg, release), "origin/main") : [];
  if (files.length) return codeToProduction(pg, release, by, files, log);
  const dir = join(tmpdir(), `cms-publish-${Date.now()}`);
  await git(["worktree", "add", "--detach", dir, "origin/main"], log);
  try {
    const content = await contentFor(pg, release, "production", by);
    writeFileSync(join(dir, "content", "site.json"), JSON.stringify(content, null, 2) + "\n");
    const changed = await git(["status", "--porcelain", "--", "content/site.json"], log, dir);
    if (!changed) {
      log(logLine("deploy.productionSame"));
      return;
    }
    await git(["add", "--", "content/site.json"], log, dir);
    await git(["commit", "-m", `Content: release ${release} (${by})`, "--", "content/site.json"], log, dir);
    await git(["push", "origin", "HEAD:main"], log, dir);
    log(logLine("deploy.productionDone"));
  } finally {
    await git(["worktree", "remove", "--force", dir], log).catch(() =>
      rmSync(dir, { recursive: true, force: true }),
    );
  }
}

/**
 * The CMS's own preview: the website in CMS mode, with the workflow's files (已签入) as its starting content, on main with
 * the built-in templates in the workflow (one whose code main changed since is left out: its own page says so).
 */
export async function buildCmsSite(log: (s: string) => void = (s) => process.stdout.write(s)) {
  const pg = await db();
  const file = deployDir("cms", "content.json");
  mkdirSync(deployDir("cms"), { recursive: true });
  writeFileSync(file, JSON.stringify(await buildContent(pg, "workflow"), null, 2) + "\n");
  const code = await codeChanges(pg, await revisionsAt(pg, OVERLAYS.workflow), "main", { lenient: true });
  const target = deployDir("cms", "site");
  await inTree(async (dir) => {
    await checkout(dir, "main", code, log);
    await buildSite(dir, file, ".cms-build/cms", { NEXT_PUBLIC_CMS: "on" }, log);
    rmSync(target, { recursive: true, force: true });
    cpSync(join(dir, ".cms-build", "cms"), target, { recursive: true });
    rmSync(join(dir, ".cms-build", "cms"), { recursive: true, force: true });
  }, log);
  log(`\nCMS preview built: ${target}\n`);
}

const building = globalThis as unknown as { cmsSiteBuild?: Promise<void>; again?: boolean };

/**
 * The CMS's preview built in the background, once at a time: false when a build is running already. With [queue], one
 * asked for meanwhile runs once that one ends (a built-in template that came into the workflow while it built).
 */
export function startCmsSiteBuild(queue = false): boolean {
  if (building.cmsSiteBuild) {
    if (queue) building.again = true;
    return false;
  }
  building.cmsSiteBuild = buildCmsSite()
    .catch((e) => console.error(e))
    .finally(() => {
      building.cmsSiteBuild = undefined;
      if (building.again) {
        building.again = false;
        startCmsSiteBuild();
      }
    });
  return true;
}

export const cmsSiteBuilding = () => !!building.cmsSiteBuild;

/**
 * Sends [release] to [env], in the background: the deployment's id at once, its log and its end in the database. It
 * does [action] to [items]: [onSuccess] moves them on once the site shows the release (a failed one leaves them where
 * they were). [runner] is for tests (no build, no git).
 */
export async function deploy(
  env: Env,
  release: number,
  by: string,
  o: {
    action: Action;
    items?: Item[];
    onSuccess?: (pg: Pg) => Promise<void>;
    runner?: (log: (s: string) => void) => Promise<void>;
  },
) {
  const { runner } = o;
  const pg = await db();
  const id = await beginDeployment(pg, env, release, by, o.action, o.items);
  let pendingLog = "";
  let flushing: Promise<void> = Promise.resolve();
  const log = (s: string) => {
    pendingLog += s;
    flushing = flushing.then(async () => {
      const text = pendingLog;
      pendingLog = "";
      if (text) await appendLog(pg, id, text);
    });
  };
  const work = runner
    ? runner(log)
    : env === "preview"
      ? toPreview(pg, release, by, log)
      : toProduction(pg, release, by, log, o.action !== "rollback");
  const failed = async (e: unknown) => {
    await flushing;
    // A refusal of the CMS's own (a built-in template's code changed meanwhile) is said in the reader's words.
    const why =
      e instanceof CmsError
        ? logLine("deploy.failed", { reason: e.msg }) +
          e.details.map((d) => (typeof d === "string" ? `${d}\n` : logLine(d.key, d.values))).join("")
        : logLine("deploy.failed", { reason: e instanceof Error ? e.message : String(e) });
    await finishDeployment(pg, id, false, `${pendingLog}${why}`);
  };
  const done = work.then(async () => {
    try {
      await o.onSuccess?.(pg);
    } catch (e) {
      return failed(e);
    }
    await flushing;
    await markDeployed(pg, env, release, by);
    await finishDeployment(pg, id, true, pendingLog);
  }, failed);
  return { id, done };
}
