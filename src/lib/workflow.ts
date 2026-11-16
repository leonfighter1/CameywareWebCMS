/**
 * The workflow (the owner, 2026-11-15: 「通过checkin 一些component或者page可以push到 cms.preview.cameyware.com， 然后还可以
 * 再push到preview.cameyware.com ， 最后可以直接push到production」):
 *   save      → the working copy (a draft): only the CMS's preview with 草稿 on shows it;
 *   签入      → the chosen items, with a message, become what the CMS's preview shows (已签入), at once;
 *   推到预览站 → a release (everything checked in, the active pages) is built into preview.cameyware.com;
 *   推到正式站 → the release preview shows goes to www.cameyware.com (committed to the website's repository).
 * Any earlier release can be sent to either again (a rollback).
 */
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db";
import {
  buildContent,
  canonical,
  changes,
  checkedIn,
  CmsError,
  getPage,
  type Kind,
  workingStates,
} from "./store";

export type Item = { kind: Kind; id: string };

/**
 * [items] checked in as one, with [message]. A page brings in its blocks that were never checked in (a new block on
 * it), so the page never stands checked in without one of its blocks. Returns the check-in's id.
 */
export async function checkIn(db: PGlite, items: Item[], message: string, author: string): Promise<number> {
  if (!message.trim()) throw new CmsError("请写一句签入说明");
  if (!items.length) throw new CmsError("没有选要签入的内容");
  const done = await checkedIn(db);
  const wanted = new Map(items.map((i) => [`${i.kind}:${i.id}`, i]));
  for (const i of items)
    if (i.kind === "page")
      for (const b of (await getPage(db, i.id))?.blocks ?? [])
        if (!done.has(`component:${b}`)) wanted.set(`component:${b}`, { kind: "component", id: b });
  const work = await workingStates(db);
  const missing = [...wanted.keys()].filter((k) => !work.has(k));
  if (missing.length) throw new CmsError("有些内容找不到了", missing);
  return db.transaction(async (tx) => {
    const list = [...wanted.values()];
    // Numbered one after the last (people read these numbers): a sequence jumps after an unclean stop.
    const { rows } = await tx.query<{ id: number }>(
      `insert into checkins (id, message, author, items)
         values ((select coalesce(max(id), 0) + 1 from checkins), $1, $2, $3) returning id`,
      [message.trim(), author, JSON.stringify(list)],
    );
    const id = Number(rows[0]!.id);
    for (const i of list) {
      const w = work.get(`${i.kind}:${i.id}`)!;
      await tx.query(
        `insert into revisions (kind, entity_id, data, deleted, checkin_id, author) values ($1, $2, $3, $4, $5, $6)`,
        [i.kind, i.id, w.deleted ? null : JSON.stringify(w.state), w.deleted, id, author],
      );
    }
    return id;
  });
}

/** Every change not checked in, ready for the 签入 page. */
export const pending = changes;

export async function checkins(db: Db, limit = 50) {
  return (
    await db.query<{ id: number; message: string; author: string; created_at: string; items: Item[] }>(
      `select * from checkins order by id desc limit $1`,
      [limit],
    )
  ).rows;
}

/** An item's check-ins, newest first, with each one's message. */
export async function history(db: Db, kind: Kind, id: string) {
  return (
    await db.query<{
      id: number;
      data: unknown;
      deleted: boolean;
      author: string;
      created_at: string;
      message: string;
      checkin_id: number;
    }>(
      `select r.id, r.data, r.deleted, r.author, r.created_at, c.message, c.id as checkin_id
         from revisions r join checkins c on c.id = r.checkin_id
        where r.kind = $1 and r.entity_id = $2 order by r.id desc`,
      [kind, id],
    )
  ).rows;
}

/** A release: the whole site as checked in now, its active pages, frozen. */
export async function createRelease(db: Db, author: string, note = ""): Promise<number> {
  const content = await buildContent(db, "checked_in", { activeOnly: true });
  // 第 N 版: one after the last, whatever the sequence did across a restart.
  const { rows } = await db.query<{ id: number }>(
    `insert into releases (id, author, note, content)
       values ((select coalesce(max(id), 0) + 1 from releases), $1, $2, $3) returning id`,
    [author, note, JSON.stringify(content)],
  );
  return Number(rows[0]!.id);
}

export type Release = { id: number; author: string; note: string; created_at: string };

export async function releases(db: Db, limit = 30): Promise<Release[]> {
  return (
    await db.query<Release>(`select id, author, note, created_at from releases order by id desc limit $1`, [
      limit,
    ])
  ).rows.map((r) => ({ ...r, id: Number(r.id) }));
}

export async function releaseContent(db: Db, id: number) {
  const row = (await db.query<{ content: unknown }>(`select content from releases where id = $1`, [id]))
    .rows[0];
  if (!row) throw new CmsError(`没有第 ${id} 版`);
  return row.content as Awaited<ReturnType<typeof buildContent>>;
}

export type Env = "preview" | "production";

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

export type Deployment = {
  id: number;
  env: Env;
  release_id: number;
  status: "running" | "done" | "failed";
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

/** A deployment begun: refused while another one to [env] is running. */
export async function beginDeployment(
  db: PGlite,
  env: Env,
  release: number,
  author: string,
): Promise<number> {
  return db.transaction(async (tx) => {
    const running = (
      await tx.query(`select id from deployments where env = $1 and status = 'running'`, [env])
    ).rows;
    if (running.length)
      throw new CmsError(`${env === "preview" ? "预览站" : "正式站"}正在部署，等它完成再试`);
    const { rows } = await tx.query<{ id: number }>(
      `insert into deployments (env, release_id, status, author) values ($1, $2, 'running', $3) returning id`,
      [env, release, author],
    );
    return Number(rows[0]!.id);
  });
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

/** A deployment the process didn't live to finish (a restart): failed, so the next one may start. */
export async function failInterrupted(db: Db) {
  await db.query(
    `update deployments set status = 'failed', finished_at = now(), log = log || '\n（CMS 重新启动，这次部署中断了）' where status = 'running'`,
  );
}

/** What changed from release [from] to [to] (or to what is checked in): pages, blocks, globals and texts, by id. */
export async function diff(db: Db, from: number | undefined, to: number | "checked_in") {
  const a = from ? await releaseContent(db, from) : undefined;
  const b =
    to === "checked_in"
      ? await buildContent(db, "checked_in", { activeOnly: true })
      : await releaseContent(db, to);
  const flat = (c: typeof b | undefined) => {
    // Canonical JSON: a release comes back from jsonb with its keys in another order than a content just built.
    const m = new Map<string, string>();
    if (!c) return m;
    for (const p of c.pages) {
      const { blocks, ...page } = p;
      m.set(`页面 ${p.path}`, canonical({ ...page, blocks: blocks.map((x) => x.id) }));
      for (const x of blocks) m.set(`区块 ${x.name || x.id}（${p.path}）`, canonical(x));
    }
    for (const [k, v] of Object.entries(c.globals)) m.set(`全局 ${k}`, canonical(v));
    for (const [k, v] of Object.entries(c.texts)) m.set(`文字 ${k}`, canonical(v));
    return m;
  };
  const [x, y] = [flat(a), flat(b)];
  const out: { what: string; change: "new" | "changed" | "removed" }[] = [];
  for (const [k, v] of y)
    if (!x.has(k)) out.push({ what: k, change: "new" });
    else if (x.get(k) !== v) out.push({ what: k, change: "changed" });
  for (const k of x.keys()) if (!y.has(k)) out.push({ what: k, change: "removed" });
  return out;
}
