/**
 * npm start: the CMS on this computer.
 *   1. builds the CMS (next build) when it has no build yet, or with --build;
 *   2. starts its editors and API (cms-edit, port 8790) and its preview (cms-preview, port 8791), one key between them
 *      made now (CMS_PREVIEW_KEY), so only the preview's server reads the drafts;
 *   3. builds the CMS's preview of the website when there is none yet (a few minutes, the first time);
 *   4. asks each minute for the workflow jobs whose publishing time has come (S7, /api/internal/tick).
 * The tunnel's two hostnames (Cloudflare) point at these ports; Ctrl+C stops both.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { join } from "node:path";
import addresses from "../src/generated/addresses.json";
import { deployDir } from "../src/lib/paths";

const root = process.cwd();
const win = process.platform === "win32";
const next = join(root, "node_modules", ".bin", win ? "next.cmd" : "next");
const env = {
  ...process.env,
  CMS_PREVIEW_KEY: process.env.CMS_PREVIEW_KEY ?? randomBytes(24).toString("base64url"),
};

if (!existsSync(join(root, ".next", "BUILD_ID")) || process.argv.includes("--build")) {
  console.log("building the CMS (next build)…");
  execFileSync(next, ["build"], { cwd: root, stdio: "inherit", shell: win, env });
}

const children: ChildProcess[] = [];
const stop = (code = 0) => {
  for (const c of children) c.kill();
  process.exit(code);
};
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());

const port = addresses.local.cmsEditPort;
const host = addresses.local.host;
children.push(
  spawn(next, ["start", "-p", String(port), "-H", host], { cwd: root, stdio: "inherit", shell: win, env }),
);
children.push(
  spawn(process.execPath, ["--import", "tsx", join(root, "scripts", "preview-server.ts")], {
    cwd: root,
    stdio: "inherit",
    env,
  }),
);
for (const c of children) c.on("exit", (code) => stop(code ?? 1));

// The editors up, then the preview built if it isn't yet.
const edit = `http://${host}:${port}`;
for (let i = 0; i < 120; i++) {
  const up = await fetch(`${edit}/login`).then(
    (r) => r.ok,
    () => false,
  );
  if (up) break;
  await new Promise((r) => setTimeout(r, 1000));
}
console.log(`\n  CMS central page: ${edit}/  (${addresses.company.cmsEdit})`);
console.log(
  `  CMS preview:      http://${host}:${addresses.local.cmsPreviewPort}/  (${addresses.company.cmsPreview})\n`,
);
// The jobs set to publish at a time (S7): asked each minute while the CMS runs.
setInterval(() => {
  void fetch(`${edit}/api/internal/tick`, {
    method: "POST",
    headers: { "x-cms-preview-key": env.CMS_PREVIEW_KEY },
  }).catch(() => {});
}, 60_000);
if (!existsSync(join(deployDir("cms", "site"), "index.html"))) {
  console.log("building the CMS preview of the website (a few minutes)…");
  await fetch(`${edit}/api/internal/build-cms-site`, {
    method: "POST",
    headers: { "x-cms-preview-key": env.CMS_PREVIEW_KEY },
  }).catch((e) => console.error("could not start the preview build:", e));
}
