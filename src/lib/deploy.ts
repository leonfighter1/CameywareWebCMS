/**
 * Sending a release out (workflow.ts). Each runs in the CMS's server process after the request that began it, writing
 * its log to the deployment as it goes.
 *
 *   preview     the release → deploy/preview/content.json; the website built with it (CMS_CONTENT) in a folder of its own
 *               (NEXT_DIST_DIR=.cms-build/preview), then swapped into the folder 禄命秘解's server serves as
 *               preview.cameyware.com (the website's out/). A failed build leaves preview as it was. 禄命秘解's npm run all
 *               builds from the same file, so a restart there keeps it.
 *   production  the release → content/site.json, committed alone on top of GitHub's main from a worktree of its own and
 *               pushed (C2); Cloudflare Pages builds www.cameyware.com from it. A developer's commits not pushed yet
 *               stay where they are: the CMS only ever pushes content.
 *   cms         the website built in CMS mode (NEXT_PUBLIC_CMS=on) into deploy/cms/site, which the CMS's preview server
 *               serves: needed after the website's code changes, never after content (that comes live).
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { db } from "./db";
import type { Item } from "./files";
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
} from "./releases";
import { buildContent } from "./store";

const win = process.platform === "win32";

/**
 * [cmd] in [cwd]; its output goes to [log]; resolves with its exit code. [shell] only for a .cmd (npx on Windows): a
 * shell joins the arguments unquoted, so a commit message with spaces would come apart.
 */
function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  log: (s: string) => void,
  shell = false,
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, shell });
    child.stdout.on("data", (d: Buffer) => log(d.toString()));
    child.stderr.on("data", (d: Buffer) => log(d.toString()));
    child.on("error", (e) => {
      log(`\n${e.message}\n`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code ?? 1));
  });
}

/** git in the website's repository (or [cwd]): its output, or a refusal with it. */
async function git(args: string[], log: (s: string) => void, cwd = siteRepo()): Promise<string> {
  let out = "";
  const code = await run("git", args, cwd, {}, (s) => {
    out += s;
    log(s);
  });
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed (${code})`);
  return out.trim();
}

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

/** The website built with [content] into [distDir] (inside its repository), [env] on top. */
async function buildSite(
  contentFile: string,
  distDir: string,
  env: Record<string, string>,
  log: (s: string) => void,
) {
  rmSync(join(siteRepo(), distDir), { recursive: true, force: true });
  log(`npx next build (CMS_CONTENT=${contentFile}, NEXT_DIST_DIR=${distDir})\n`);
  const code = await run(
    win ? "npx.cmd" : "npx",
    ["next", "build"],
    siteRepo(),
    { CMS_CONTENT: contentFile, NEXT_DIST_DIR: distDir, ...env },
    log,
    win,
  );
  if (code !== 0 || !existsSync(join(siteRepo(), distDir, "index.html")))
    throw new Error(`website build failed (${code})`);
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
  await buildSite(file, ".cms-build/preview", {}, log);
  const out = join(siteRepo(), "out");
  const old = join(siteRepo(), `out.old-${Date.now()}`);
  if (existsSync(out)) await renameRetrying(out, old);
  await renameRetrying(join(siteRepo(), ".cms-build", "preview"), out);
  rmSync(old, { recursive: true, force: true });
  log(logLine("deploy.previewDone"));
}

/**
 * The release as content/site.json on top of GitHub's main, from a worktree of its own (a temporary folder checked out at
 * origin/main): the commit holds that file alone and is pushed as it is, so a developer's commits not pushed yet in the
 * website's repository never go out with it, nor block it. That repository is one commit behind GitHub afterwards; its
 * next push fetches it first, as git asks.
 */
async function toProduction(pg: Pg, release: number, by: string, log: (s: string) => void) {
  await git(["fetch", "origin", "main"], log);
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

/** The CMS's own preview: the website in CMS mode, with the workflow's files (已签入) as its starting content. */
export async function buildCmsSite(log: (s: string) => void = (s) => process.stdout.write(s)) {
  const pg = await db();
  const file = deployDir("cms", "content.json");
  mkdirSync(deployDir("cms"), { recursive: true });
  writeFileSync(file, JSON.stringify(await buildContent(pg, "workflow"), null, 2) + "\n");
  await buildSite(file, ".cms-build/cms", { NEXT_PUBLIC_CMS: "on" }, log);
  const target = deployDir("cms", "site");
  rmSync(target, { recursive: true, force: true });
  cpSync(join(siteRepo(), ".cms-build", "cms"), target, { recursive: true });
  rmSync(join(siteRepo(), ".cms-build", "cms"), { recursive: true, force: true });
  log(`\nCMS preview built: ${target}\n`);
}

const building = globalThis as unknown as { cmsSiteBuild?: Promise<void> };

/** The CMS's preview built in the background, once at a time: false when a build is running already. */
export function startCmsSiteBuild(): boolean {
  if (building.cmsSiteBuild) return false;
  building.cmsSiteBuild = buildCmsSite()
    .catch((e) => console.error(e))
    .finally(() => (building.cmsSiteBuild = undefined));
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
      : toProduction(pg, release, by, log);
  const failed = async (e: unknown) => {
    await flushing;
    await finishDeployment(
      pg,
      id,
      false,
      `${pendingLog}${logLine("deploy.failed", { reason: e instanceof Error ? e.message : String(e) })}`,
    );
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
