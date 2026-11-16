/**
 * The tools the CMS's server runs (deploy.ts, code.ts): git in the website's repository, npx for its build. Each one's
 * output goes to a deployment's log as it comes.
 */
import { spawn } from "node:child_process";
import { siteRepo } from "./paths";

/**
 * [cmd] in [cwd]; its output goes to [log]; resolves with its exit code. [shell] only for a .cmd (npx on Windows): a
 * shell joins the arguments unquoted, so a commit message with spaces would come apart.
 */
export function run(
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
export async function git(args: string[], log: (s: string) => void, cwd = siteRepo()): Promise<string> {
  let out = "";
  const code = await run("git", args, cwd, {}, (s) => {
    out += s;
    log(s);
  });
  if (code !== 0) throw new Error(`git ${args.join(" ")} failed (${code})`);
  return out.trim();
}

/**
 * [paths] as [ref] has them (a branch, origin/main), from one git process: each file's text, or undefined where [ref]
 * has no such file (or no such ref).
 */
export function gitTexts(
  ref: string,
  paths: string[],
  cwd = siteRepo(),
): Promise<Map<string, string | undefined>> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", ["cat-file", "--batch"], { cwd });
    const chunks: Buffer[] = [];
    child.stdout.on("data", (d: Buffer) => chunks.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`git cat-file failed (${code})`));
      const all = Buffer.concat(chunks);
      const out = new Map<string, string | undefined>();
      let at = 0;
      for (const path of paths) {
        const eol = all.indexOf(10, at);
        const head = all.subarray(at, eol).toString();
        at = eol + 1;
        const m = / blob (\d+)$/.exec(head);
        if (!m) {
          out.set(path, undefined);
          continue;
        }
        const size = Number(m[1]);
        out.set(path, all.subarray(at, at + size).toString("utf8"));
        at += size + 1;
      }
      resolve(out);
    });
    child.stdin.end(paths.map((p) => `${ref}:${p}\n`).join(""));
  });
}
