/**
 * Releases, environments and deployments: the records the workflow's steps (workflow.ts) and the deployer (deploy.ts)
 * keep. A release is a site frozen at a moment, with the version of every file it was made of (its manifest); an
 * environment (preview, production) names the release it shows; a deployment is one release sent to one of them, with
 * what it does to which files and its log.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db";
import { type FileRow, type Item, keyOf } from "./files";
import { buildContent, canonical, contentOf, OVERLAYS, revisionsAt, type View } from "./store";
import type { Placement } from "./pages";
import { CmsError, type Detail, type Lang, msg, say, type Values } from "./words";
import { isBuiltinLayout } from "@/generated/layouts";

export type Env = "preview" | "production";

/**
 * A release of the site as a site shows it: production's files with those [overlay] picks from the workflow, the
 * active pages alone. Refused, with every page and block, when a page would show without one of its blocks or a block
 * without its template.
 */
export async function createRelease(db: Db, author: string, note: string, overlay: (f: FileRow) => boolean) {
  const revisions = await revisionsAt(db, overlay);
  const missing: Detail[] = [];
  const gone = (key: string) => {
    const r = revisions.get(key);
    return !r || r.deleted;
  };
  for (const r of revisions.values()) {
    if (r.kind !== "page" || r.deleted) continue;
    const p = r.data as { path: string; status: string; layout: string; blocks: Placement[] };
    if (p.status !== "active") continue;
    if (!isBuiltinLayout(p.layout) && gone(`layout:${p.layout}`))
      missing.push(msg("errors.layoutMissingAt", { path: p.path, layout: p.layout }));
    for (const b of p.blocks) {
      if (gone(`component:${b.id}`))
        missing.push(msg("errors.blockMissingAt", { path: p.path, block: b.id }));
      if (b.style && gone(`template:${b.style}`))
        missing.push(msg("errors.templateMissingAt", { path: p.path, block: b.id, template: b.style }));
    }
  }
  if (missing.length) throw new CmsError("errors.releaseIncomplete", undefined, missing);
  const content = contentOf(revisions, { activeOnly: true });
  const manifest = Object.fromEntries([...revisions].map(([k, r]) => [k, r.id]));
  // 第 N 版: one after the last, whatever the sequence did across a restart.
  const { rows } = await db.query<{ id: number }>(
    `insert into releases (id, author, note, content, manifest)
       values ((select coalesce(max(id), 0) + 1 from releases), $1, $2, $3, $4) returning id`,
    [author, note, JSON.stringify(content), JSON.stringify(manifest)],
  );
  return Number(rows[0]!.id);
}

export type Release = {
  id: number;
  author: string;
  note: string;
  created_at: string;
  /** Where it went (a deployment that finished). */
  went: Env[];
  /** Made since S2: it lists its files' versions, so production can go back to it. */
  manifest: boolean;
};

export async function releases(db: Db, limit = 30): Promise<Release[]> {
  const { rows } = await db.query<Omit<Release, "went" | "manifest"> & { went: Env[] | null; has: boolean }>(
    `select r.id, r.author, r.note, r.created_at, r.manifest is not null as has,
            (select array_agg(distinct d.env) from deployments d where d.release_id = r.id and d.status = 'done') as went
       from releases r order by r.id desc limit $1`,
    [limit],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    author: r.author,
    note: r.note,
    created_at: r.created_at,
    went: r.went ?? [],
    manifest: r.has,
  }));
}

export async function releaseContent(db: Db, id: number) {
  const row = (await db.query<{ content: unknown }>(`select content from releases where id = $1`, [id]))
    .rows[0];
  if (!row) throw new CmsError("errors.noRelease", { id });
  return row.content as Awaited<ReturnType<typeof buildContent>>;
}

export async function releaseManifest(db: Db, id: number): Promise<Record<string, number>> {
  const row = (
    await db.query<{ manifest: Record<string, number> | null }>(
      `select manifest from releases where id = $1`,
      [id],
    )
  ).rows[0];
  if (!row) throw new CmsError("errors.noRelease", { id });
  if (!row.manifest) throw new CmsError("errors.noManifest", { id });
  return row.manifest;
}

/** The releases that went to production, each with its manifest: what a revision was published in. */
export async function productionManifests(db: Db) {
  const { rows } = await db.query<{ id: number; manifest: Record<string, number> }>(
    `select r.id, r.manifest from releases r
      where r.manifest is not null
        and exists (select 1 from deployments d where d.release_id = r.id and d.env = 'production' and d.status = 'done')
      order by r.id`,
  );
  return rows.map((r) => ({ id: Number(r.id), manifest: r.manifest }));
}

export async function environments(db: Db) {
  const rows = (
    await db.query<{
      name: Env;
      release_id: number | null;
      deployed_at: string | null;
      deployed_by: string | null;
    }>(`select * from environments`)
  ).rows;
  const of = (name: Env) => {
    const r = rows.find((x) => x.name === name);
    return {
      name,
      release: r?.release_id ? Number(r.release_id) : undefined,
      at: r?.deployed_at ?? undefined,
      by: r?.deployed_by ?? undefined,
    };
  };
  return { preview: of("preview"), production: of("production") };
}

/** [env] now shows [release]. */
export async function markDeployed(db: Db, env: Env, release: number, by: string) {
  await db.query(
    `insert into environments (name, release_id, deployed_at, deployed_by) values ($1, $2, now(), $3)
       on conflict (name) do update set release_id = $2, deployed_at = now(), deployed_by = $3`,
    [env, release, by],
  );
}

/** What a deployment does: a step of the workflow, or the first content. */
export type Action = "preview" | "back" | "production" | "rollback" | "rebuild" | "seed" | "release";

export type Deployment = {
  id: number;
  env: Env;
  release_id: number;
  status: "running" | "done" | "failed";
  action: Action;
  items: Item[];
  author: string;
  started_at: string;
  finished_at: string | null;
  log: string;
};

export async function deployments(db: Db, limit = 20): Promise<Deployment[]> {
  return (
    await db.query<Deployment>(`select * from deployments order by id desc limit $1`, [limit])
  ).rows.map((d) => ({
    ...d,
    id: Number(d.id),
    release_id: Number(d.release_id),
  }));
}

/** The files a running deployment is moving: nobody moves them again until it ends. */
export async function busyItems(db: Db): Promise<Set<string>> {
  const { rows } = await db.query<{ items: Item[] }>(
    `select items from deployments where status = 'running'`,
  );
  return new Set(rows.flatMap((r) => r.items.map(keyOf)));
}

/** A deployment begun: refused while another one to [env] is running. */
export async function beginDeployment(
  db: PGlite,
  env: Env,
  release: number,
  author: string,
  action: Action,
  items: Item[] = [],
): Promise<number> {
  return db.transaction(async (tx) => {
    const running = (
      await tx.query(`select id from deployments where env = $1 and status = 'running'`, [env])
    ).rows;
    if (running.length)
      throw new CmsError(env === "preview" ? "errors.previewBusy" : "errors.productionBusy");
    const { rows } = await tx.query<{ id: number }>(
      `insert into deployments (env, release_id, status, author, action, items)
         values ($1, $2, 'running', $3, $4, $5) returning id`,
      [env, release, author, action, JSON.stringify(items)],
    );
    return Number(rows[0]!.id);
  });
}

/** A deployment that happened without a build (the first content): recorded as done, and [env] showing [release]. */
export async function recordDeployed(
  db: Db,
  env: Env,
  release: number,
  by: string,
  action: Action,
  log: string,
) {
  await db.query(
    `insert into deployments (env, release_id, status, author, action, finished_at, log)
       values ($1, $2, 'done', $3, $4, now(), $5)`,
    [env, release, by, action, log],
  );
  await markDeployed(db, env, release, by);
}

export async function appendLog(db: Db, id: number, text: string) {
  await db.query(`update deployments set log = log || $2 where id = $1`, [id, text]);
}

export async function finishDeployment(db: Db, id: number, ok: boolean, text = "") {
  await db.query(`update deployments set status = $2, finished_at = now(), log = log || $3 where id = $1`, [
    id,
    ok ? "done" : "failed",
    text,
  ]);
}

/** A line of the CMS's own in a log: kept as its key, said in the reader's language when shown (`readLog`). */
export const logLine = (key: string, values?: Values) => `\n§${JSON.stringify(msg(key, values))}\n`;

/** A log as [lang] reads it: the CMS's own lines in it, the tools' output as it is. */
export function readLog(log: string, lang: Lang) {
  return log
    .split("\n")
    .map((line) => {
      if (!line.startsWith("§")) return line;
      try {
        return say(JSON.parse(line.slice(1)), lang);
      } catch {
        return line;
      }
    })
    .join("\n");
}

/** A deployment the process didn't live to finish (a restart): failed, so the next one may start. */
export async function failInterrupted(db: Db) {
  await db.query(
    `update deployments set status = 'failed', finished_at = now(), log = log || $1 where status = 'running'`,
    [logLine("deploy.interrupted")],
  );
}

/** What changed from release [from] to [to] (or to what a site shows now): pages, blocks, globals and texts. */
export async function diff(db: Db, from: number | undefined, to: number | Exclude<View, "draft">) {
  const a = from ? await releaseContent(db, from) : undefined;
  const b =
    typeof to === "number"
      ? await releaseContent(db, to)
      : contentOf(await revisionsAt(db, OVERLAYS[to]), { activeOnly: true });
  const flat = (c: typeof b | undefined) => {
    // Canonical JSON: a release comes back from jsonb with its keys in another order than a content just built.
    const m = new Map<string, { kind: string; name: string; value: string }>();
    if (!c) return m;
    for (const p of c.pages) {
      const { blocks, ...page } = p;
      m.set(`page:${p.id}`, {
        kind: "page",
        name: p.path,
        value: canonical({ ...page, blocks: blocks.map((x) => x.id) }),
      });
      for (const x of blocks)
        m.set(`component:${x.id}@${p.path}`, {
          kind: "component",
          name: `${x.name || x.id} (${p.path})`,
          value: canonical(x),
        });
    }
    for (const [k, v] of Object.entries(c.globals))
      m.set(`global:${k}`, { kind: "global", name: k, value: canonical(v) });
    for (const [k, v] of Object.entries(c.texts))
      m.set(`text:${k}`, { kind: "text", name: k, value: canonical(v) });
    for (const [k, v] of Object.entries(c.templates ?? {}))
      m.set(`template:${k}`, { kind: "template", name: v.name, value: canonical(v) });
    for (const [k, v] of Object.entries(c.layouts ?? {}))
      m.set(`layout:${k}`, { kind: "layout", name: v.name, value: canonical(v) });
    return m;
  };
  const [x, y] = [flat(a), flat(b)];
  const out: { kind: string; name: string; change: "new" | "changed" | "removed" }[] = [];
  for (const [k, v] of y)
    if (!x.has(k)) out.push({ kind: v.kind, name: v.name, change: "new" });
    else if (x.get(k)!.value !== v.value) out.push({ kind: v.kind, name: v.name, change: "changed" });
  for (const [k, v] of x) if (!y.has(k)) out.push({ kind: v.kind, name: v.name, change: "removed" });
  return out;
}
