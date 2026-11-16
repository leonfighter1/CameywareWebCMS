/**
 * 内置模板代码 (S6; the owner, 2026-11-16: 「for all the builtin template … checkout and replace the same file from local
 * file. The file's status should follow the same statuses like regular files. however, we should have version controls.
 * while we upload a new template file, for cms-preview branch should be created and allow us to run push for the
 * files」, then 「we should be able to view the file, download the file upload the file, if file never taken by others,
 * it should be automatically replaced」). Each type's built-in template is a file of the website's code
 * (src/cms/views/<type>.tsx) and a file here (kind `code`, its id the type): a working copy, versions, the workflow.
 *
 *   The website's main brings them in (seed.ts addCodeFiles): a file the CMS lacks, and a change the code made to one
 *   nobody holds, become production's version at once. A text main has that the CMS had once is main behind the CMS (a
 *   push not pulled yet), never a change of the code's.
 *   The CMS builds its sites in its checkout of the website (TREE, a git worktree inside it, git-ignored there):
 *   preview on the branch cms-preview (main, with one commit per file the release has otherwise), the CMS's own preview
 *   on main with the files in the workflow; 推到正式站 on GitHub's main, built first, then committed and pushed.
 *   A file in the workflow whose code main (or GitHub) changed since the CMS took it in refuses to go on: the code's
 *   change would be lost.
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "./db";
import { fileStates } from "./files";
import { git, gitTexts, run } from "./git";
import { siteRepo } from "./paths";
import { revisionsById, type Revision } from "./store";
import { CmsError, type Detail, msg } from "./words";
import { codePath } from "@/generated/code";

export const CODE_BRANCH = "cms-preview";
const win = process.platform === "win32";

/** The CMS's checkout of the website: CMS_SITE_TREE, else .cms-tree inside its repository. */
export const treeDir = () => process.env.CMS_SITE_TREE || join(siteRepo(), ".cms-tree");

/** What a build in the tree needs: the website's folder as Turbopack's root, so its node_modules serve the tree. */
export const treeEnv = () => ({ CMS_TURBOPACK_ROOT: siteRepo() });

type CodeState = { source: string };
const sourceOf = (r: Revision | undefined) => (r && !r.deleted ? (r.data as CodeState).source : undefined);

/** Every text the CMS has had of each code file (its versions'), by id. */
export async function knownTexts(db: Db): Promise<Map<string, Set<string>>> {
  const { rows } = await db.query<{ entity_id: string; source: string }>(
    `select entity_id, data->>'source' as source from revisions where kind = 'code' and not deleted`,
  );
  const out = new Map<string, Set<string>>();
  for (const r of rows) out.set(r.entity_id, (out.get(r.entity_id) ?? new Set()).add(r.source));
  return out;
}

/**
 * How [ref]'s file stands to the CMS's: the same as production's version, missing, behind (a text the CMS had: its
 * push not there yet), or changed (a text the CMS never had: the code's own change).
 */
export function standing(
  there: string | undefined,
  production: string | undefined,
  known: Set<string> | undefined,
): "same" | "missing" | "behind" | "changed" {
  if (there === undefined) return "missing";
  if (there === production) return "same";
  return known?.has(there) ? "behind" : "changed";
}

/** A built-in template a build writes over the website's code: where, which, the CMS's version and its text. */
export type CodeFile = { path: string; id: string; revision: number; text: string };

/** The line a commit gives it. */
export const codeLine = (f: CodeFile) => `Code: ${f.path} (CMS version ${f.revision})`;

/**
 * The code files a build at [ref] takes from the CMS: of [revisions] (a site's versions, by `kind:id`), each code file
 * whose text [ref] hasn't. A file in the workflow meeting a change of the code's refuses it all (unless [lenient]: the
 * CMS's own preview leaves it out); production's version meeting one gives way (the code's is newer).
 */
export async function codeChanges(
  db: Db,
  revisions: Map<string, Revision>,
  ref: string,
  o: { lenient?: boolean } = {},
): Promise<CodeFile[]> {
  const code = [...revisions.values()].filter((r) => r.kind === "code" && !r.deleted);
  const out: CodeFile[] = [];
  if (!code.length) return out;
  const [states, known] = await Promise.all([fileStates(db), knownTexts(db)]);
  const prodIds = code.flatMap((r) => {
    const p = states.get(`code:${r.entity_id}`)?.prod_revision_id;
    return p ? [p] : [];
  });
  const [prod, texts] = await Promise.all([
    revisionsById(db, prodIds),
    gitTexts(
      ref,
      code.map((r) => codePath(r.entity_id)),
      siteRepo(),
    ),
  ]);
  const refused: Detail[] = [];
  for (const r of code) {
    const path = codePath(r.entity_id);
    const text = sourceOf(r)!;
    const there = texts.get(path);
    if (there === text) continue;
    const s = standing(there, sourceOf(prod.get(`code:${r.entity_id}`)), known.get(r.entity_id));
    const workflow = states.get(`code:${r.entity_id}`)?.prod_revision_id !== r.id;
    if (s === "same" || s === "behind") out.push({ path, id: r.entity_id, revision: r.id, text });
    else if (workflow && !o.lenient)
      refused.push(msg(s === "missing" ? "errors.codeMissing" : "errors.codeChanged", { file: path, ref }));
  }
  if (refused.length) throw new CmsError("errors.codeConflict", undefined, refused);
  return out;
}

const lock = globalThis as unknown as { cmsTree?: Promise<unknown> };

/**
 * [work] in the CMS's checkout of the website (made the first time, at main), one at a time; afterwards it is back on
 * cms-preview, the code preview shows (禄命秘解's npm run all builds preview there too).
 */
export function inTree<T>(work: (dir: string) => Promise<T>, log: (s: string) => void): Promise<T> {
  const next = (lock.cmsTree ?? Promise.resolve()).then(async () => {
    const dir = treeDir();
    if (!existsSync(join(dir, ".git"))) {
      await git(["worktree", "prune"], log);
      await git(["worktree", "add", "--detach", dir, "main"], log);
    }
    try {
      return await work(dir);
    } finally {
      const branch = await git(["branch", "--list", CODE_BRANCH], () => {}, dir).catch(() => "");
      if (branch) await git(["checkout", "-q", "-f", CODE_BRANCH], log, dir).catch(() => {});
      await git(["clean", "-fdq"], log, dir).catch(() => {});
    }
  });
  lock.cmsTree = next.catch(() => {});
  return next;
}

/**
 * The tree at [base] (main, origin/main) with [files] written over it: on [branch] one commit each, else left
 * uncommitted on a detached head.
 */
export async function checkout(
  dir: string,
  base: string,
  files: CodeFile[],
  log: (s: string) => void,
  branch?: string,
) {
  await git(["checkout", "-q", "-f", ...(branch ? ["-B", branch] : ["--detach"]), base], log, dir);
  await git(["clean", "-fdq"], log, dir);
  for (const f of files) {
    writeFileSync(join(dir, f.path), f.text);
    if (!branch) continue;
    await git(["add", "--", f.path], log, dir);
    await git(["commit", "-q", "-m", codeLine(f), "--", f.path], log, dir);
  }
}

/** The website's lint on [paths] in the tree (what its CI runs on them): refused with its output in the log. */
export async function lintCode(dir: string, paths: string[], log: (s: string) => void) {
  if (!paths.length) return;
  log(`npx eslint ${paths.join(" ")}\n`);
  const code = await run(win ? "npx.cmd" : "npx", ["eslint", ...paths], dir, {}, log, win);
  if (code !== 0) throw new CmsError("errors.codeLint");
}
