/**
 * The workflow (the owner, 2026-11-15: 「只有文件被checkout的情况下可以add into workflow. 还有图中，我们可以添加一个退回签入
 * step, 在签入的step我们也可以添加terminate workflow的功能 … 文件还可以被discard, discard后的文件自动退回上一个 pushed to
 * prod的版本。 preview 版本只留在cms preview 和preview中」). A file checked out (files.ts) moves on like this:
 *
 *   签入        your files, with a message: locked in the workflow at 已签入 (the CMS's preview shows them)
 *     终止       back to whoever checked them in, checked out, their changes kept (W1)
 *     推到预览站  built into preview.cameyware.com with production and the files there already: at 预览站
 *   预览站
 *     退回签入    preview built again without them: at 已签入 again, still locked (W2)
 *     推到正式站  production's files with these alone, committed and pushed: production's version now, nobody's
 *
 *   放回 (files.ts) leaves a file nobody's with its changes (W3); 丢弃 puts production's version back.
 *   Versions (W4): every check-in is a version of its files; restoring one makes it your draft again, for the workflow.
 *   Production can go back to a release it showed before, as a whole (an emergency), its files' versions with it.
 *
 * A step that builds a site moves its files once the site shows them: a failed build leaves them where they were.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db";
import { deploy } from "./deploy";
import { fileStates, type FileRow, type Item, keyOf, mustHold, mustHoldAll, type Stage } from "./files";
import {
  busyItems,
  createRelease,
  type Env,
  environments,
  logLine,
  productionManifests,
  recordDeployed,
  releaseManifest,
  releases,
} from "./releases";
import {
  canonical,
  type Change,
  changeOf,
  forget,
  getPage,
  type Kind,
  revisionsById,
  usedOn,
  workingStates,
  writeWorking,
} from "./store";
import { type Both, CmsError, type Detail, msg } from "./words";

export type { Item } from "./files";

type Pg = PGlite;

// ---- files as the pages list them ---------------------------------------------------------------------------

export type FileInfo = FileRow & {
  label: Both;
  /** How its working copy differs from production's version. */
  change?: Change["change"];
  /** A running deployment is moving it. */
  busy: boolean;
  /** Its check-in, while in the workflow. */
  checkin?: { id: number; message: string; author: string; at: string };
};

/** Every file with its state, its name and its change: what 我的文件, the workflow and the central page list. */
export async function files(db: Pg): Promise<FileInfo[]> {
  const [states, work, busy] = await Promise.all([fileStates(db), workingStates(db), busyItems(db)]);
  const prod = await revisionsById(
    db,
    [...states.values()].flatMap((f) => (f.prod_revision_id ? [f.prod_revision_id] : [])),
  );
  const { rows } = await db.query<{ id: number; message: string; author: string; created_at: string }>(
    `select id, message, author, created_at from checkins where id in (select checkin_id from items where checkin_id is not null)`,
  );
  const checkins = new Map(rows.map((c) => [Number(c.id), c]));
  const out: FileInfo[] = [];
  for (const [key, f] of states) {
    const w = work.get(key);
    if (!w) continue;
    const c = f.checkin_id ? checkins.get(f.checkin_id) : undefined;
    out.push({
      ...f,
      label: w.label,
      change: changeOf(w, prod.get(key)),
      busy: busy.has(key),
      checkin: c && { id: Number(c.id), message: c.message, author: c.author, at: c.created_at },
    });
  }
  const order: Kind[] = ["page", "component", "global", "text"];
  return out.sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.zh.localeCompare(b.label.zh),
  );
}

// ---- check-in ----------------------------------------------------------------------------------------------

async function recordCheckin(db: Db, items: Item[], message: string, author: string) {
  const work = await workingStates(db);
  const missing = items.filter((i) => !work.has(keyOf(i))).map((i) => i.id);
  if (missing.length) throw new CmsError("errors.filesGone", undefined, missing);
  const { rows } = await db.query<{ id: number }>(
    // Numbered one after the last (people read these numbers): a sequence jumps after an unclean stop.
    `insert into checkins (id, message, author, items)
       values ((select coalesce(max(id), 0) + 1 from checkins), $1, $2, $3) returning id`,
    [message.trim(), author, JSON.stringify(items)],
  );
  const checkin = Number(rows[0]!.id);
  const revisions = new Map<string, number>();
  for (const i of items) {
    const w = work.get(keyOf(i))!;
    const r = await db.query<{ id: number }>(
      `insert into revisions (kind, entity_id, data, deleted, checkin_id, author) values ($1, $2, $3, $4, $5, $6) returning id`,
      [i.kind, i.id, w.deleted ? null : JSON.stringify(w.state), w.deleted, checkin, author],
    );
    revisions.set(keyOf(i), Number(r.rows[0]!.id));
  }
  return { checkin, revisions };
}

/** A page's blocks production lacks (never published, or deleted there). */
async function newBlocksOf(db: Pg, pageId: string, states: Map<string, FileRow>) {
  const page = await getPage(db, pageId);
  const prodIds = (page?.blocks ?? []).flatMap((b) => {
    const p = states.get(`component:${b}`)?.prod_revision_id;
    return p ? [p] : [];
  });
  const prod = await revisionsById(db, prodIds);
  return (page?.blocks ?? []).filter((b) => {
    const r = prod.get(`component:${b}`);
    return !r || r.deleted;
  });
}

/**
 * 签入: [items], every one checked out by [author], into the workflow at 已签入 with [message]. A page brings the new
 * blocks on it that are also [author]'s; a new block someone else holds, or one not coming along, refuses it.
 */
export async function checkIn(db: Pg, items: Item[], message: string, author: string): Promise<number> {
  if (!message.trim()) throw new CmsError("errors.checkinMessage");
  await mustHoldAll(db, items, author);
  const states = await fileStates(db);
  const wanted = new Map(items.map((i) => [keyOf(i), i]));
  const problems: Detail[] = [];
  for (const i of items) {
    if (i.kind !== "page") continue;
    for (const b of await newBlocksOf(db, i.id, states)) {
      const f = states.get(`component:${b}`);
      if (wanted.has(`component:${b}`) || f?.status === "in_workflow") continue;
      if (f?.status === "checked_out" && f.owner === author)
        wanted.set(`component:${b}`, { kind: "component", id: b });
      else problems.push(msg("errors.blockNotComing", { block: b, owner: f?.owner ?? "—" }));
    }
  }
  if (problems.length) throw new CmsError("errors.checkinIncomplete", undefined, problems);
  return db.transaction(async (tx) => {
    const list = [...wanted.values()];
    const { checkin, revisions } = await recordCheckin(tx, list, message, author);
    for (const i of list)
      await tx.query(
        `update items set status = 'in_workflow', stage = 'checked_in', owner = $3, revision_id = $4, checkin_id = $5,
           since = now() where kind = $1 and id = $2`,
        [i.kind, i.id, author, revisions.get(keyOf(i)), checkin],
      );
    return checkin;
  });
}

/**
 * Files checked in and published at once, nobody's afterwards: the first content and the texts the website's code
 * adds (production already shows them: the website falls back to its code's words).
 */
export async function publishDirect(db: Pg, items: Item[], message: string, author: string) {
  return db.transaction(async (tx) => {
    const { checkin, revisions } = await recordCheckin(tx, items, message, author);
    for (const i of items)
      await tx.query(
        `insert into items (kind, id, status, prod_revision_id) values ($1, $2, 'available', $3)
           on conflict (kind, id) do update set status = 'available', owner = null, stage = null, revision_id = null,
             checkin_id = null, prod_revision_id = $3, since = now()`,
        [i.kind, i.id, revisions.get(keyOf(i))],
      );
    return checkin;
  });
}

// ---- the steps ---------------------------------------------------------------------------------------------

/** Refused whole unless every one of [items] is in the workflow at [stage] and no deployment is moving it. */
async function mustBeAt(db: Pg, items: Item[], stage: Stage) {
  if (!items.length) throw new CmsError("errors.nothingChosen");
  const [states, busy] = await Promise.all([fileStates(db), busyItems(db)]);
  const details: Detail[] = [];
  for (const i of items) {
    const f = states.get(keyOf(i));
    if (busy.has(keyOf(i))) details.push(msg("errors.fileBusy", { id: i.id }));
    else if (f?.status !== "in_workflow" || f.stage !== stage)
      details.push(msg(stage === "checked_in" ? "errors.notCheckedIn" : "errors.notOnPreview", { id: i.id }));
  }
  if (details.length) throw new CmsError("errors.cannotMove", undefined, details);
  return states;
}

/** [items] with the new blocks of their pages that wait at [stage] too: a page never goes on without them. */
async function withTheirBlocks(db: Pg, items: Item[], stage: Stage, states: Map<string, FileRow>) {
  const out = new Map(items.map((i) => [keyOf(i), i]));
  for (const i of items) {
    if (i.kind !== "page") continue;
    for (const b of await newBlocksOf(db, i.id, states)) {
      const f = states.get(`component:${b}`);
      if (f?.status === "in_workflow" && f.stage === stage)
        out.set(`component:${b}`, { kind: "component", id: b });
    }
  }
  return [...out.values()];
}

/** 终止 (W1): back to whoever checked them in, checked out, their changes kept. */
export async function terminate(db: Pg, items: Item[]) {
  await mustBeAt(db, items, "checked_in");
  for (const i of items)
    await db.query(
      `update items set status = 'checked_out', stage = null, revision_id = null, checkin_id = null, since = now()
        where kind = $1 and id = $2`,
      [i.kind, i.id],
    );
}

type Runner = (log: (s: string) => void) => Promise<void>;
const inList = (items: Item[]) => {
  const keys = new Set(items.map(keyOf));
  return (f: FileRow) => keys.has(keyOf(f));
};

/** Each of [items] moved from [stage]: what a step's success does, to the files still where it found them. */
async function moveFrom(db: Pg, items: Item[], stage: Stage, set: string) {
  for (const i of items)
    await db.query(
      `update items set ${set}, since = now() where kind = $1 and id = $2 and status = 'in_workflow' and stage = $3`,
      [i.kind, i.id, stage],
    );
}

/** 推到预览站: [items] at 已签入 built into preview with production and what is there already; at 预览站 once built. */
export async function toPreview(db: Pg, items: Item[], by: string, note = "", runner?: Runner) {
  const states = await mustBeAt(db, items, "checked_in");
  const moving = await withTheirBlocks(db, items, "checked_in", states);
  const chosen = inList(moving);
  const release = await createRelease(db, by, note, (f) => f.stage === "preview" || chosen(f));
  const { id, done } = await deploy("preview", release, by, {
    action: "preview",
    items: moving,
    runner,
    onSuccess: (pg) => moveFrom(pg, moving, "checked_in", `stage = 'preview'`),
  });
  return { release, deployment: id, items: moving, done };
}

/** 退回签入 (W2): preview built again without [items]; at 已签入 again once built, still locked. */
export async function backToCheckIn(db: Pg, items: Item[], by: string, runner?: Runner) {
  await mustBeAt(db, items, "preview");
  const leaving = inList(items);
  const release = await createRelease(db, by, "", (f) => f.stage === "preview" && !leaving(f));
  const { id, done } = await deploy("preview", release, by, {
    action: "back",
    items,
    runner,
    onSuccess: (pg) => moveFrom(pg, items, "preview", `stage = 'checked_in'`),
  });
  return { release, deployment: id, done };
}

/**
 * 推到正式站: production's files with [items] (at 预览站) alone, committed and pushed; once pushed each is production's
 * version, nobody's. The other files at 预览站 stay there: preview's versions reach no further than preview.
 */
export async function toProduction(db: Pg, items: Item[], by: string, note = "", runner?: Runner) {
  const states = await mustBeAt(db, items, "preview");
  const moving = await withTheirBlocks(db, items, "preview", states);
  const release = await createRelease(db, by, note, inList(moving));
  const { id, done } = await deploy("production", release, by, {
    action: "production",
    items: moving,
    runner,
    onSuccess: (pg) =>
      moveFrom(
        pg,
        moving,
        "preview",
        `prod_revision_id = revision_id, status = 'available', owner = null, stage = null, revision_id = null,
         checkin_id = null`,
      ),
  });
  return { release, deployment: id, items: moving, done };
}

/** Preview built again as it should be (production with the files at 预览站): after production went back, or a failure. */
export async function rebuildPreview(db: Pg, by: string, runner?: Runner) {
  const release = await createRelease(db, by, "", (f) => f.stage === "preview");
  const { id, done } = await deploy("preview", release, by, { action: "rebuild", runner });
  return { release, deployment: id, done };
}

/**
 * Production back to [release], a release it showed before (W4, an emergency): its files' versions become production's
 * again; a file nobody has that showed production's version follows it; the files in the workflow stay. Preview is
 * built again afterwards, so it is production with what is at 预览站.
 */
export async function rollbackProduction(db: Pg, release: number, by: string, runner?: Runner) {
  const manifest = await releaseManifest(db, release);
  if (!(await releases(db, 1000)).find((r) => r.id === release)?.went.includes("production"))
    throw new CmsError("errors.neverOnProduction", { id: release });
  const { id, done } = await deploy("production", release, by, {
    action: "rollback",
    runner,
    onSuccess: async (pg) => {
      const states = await fileStates(pg);
      const work = await workingStates(pg);
      const old = await revisionsById(
        pg,
        [...states.values()].flatMap((f) => (f.prod_revision_id ? [f.prod_revision_id] : [])),
      );
      const now = await revisionsById(pg, Object.values(manifest));
      for (const [key, f] of states) {
        const next = manifest[key] ?? null;
        if (next === f.prod_revision_id) continue;
        const w = work.get(key);
        const was = old.get(key);
        if (f.status === "available" && w && changeOf(w, was) === undefined) {
          const r = now.get(key);
          if (r) await writeWorking(pg, f.kind, f.id, r.deleted ? null : r.data, by);
        }
        await pg.query(`update items set prod_revision_id = $3 where kind = $1 and id = $2`, [
          f.kind,
          f.id,
          next,
        ]);
      }
    },
  });
  // Preview follows once production has gone back.
  const after = done.then(async () => {
    const envs = await environments(db);
    if (envs.production.release === release)
      await rebuildPreview(db, by, runner)
        .then((r) => r.done)
        .catch(() => {});
  });
  return { release, deployment: id, done: after };
}

// ---- discard and versions ----------------------------------------------------------------------------------

/**
 * 丢弃: [items] (yours) back to production's version, nobody's; one never published goes. A new block still on one of
 * your pages refuses it, unless that page goes too.
 */
export async function discard(db: Pg, items: Item[], by: string) {
  await mustHoldAll(db, items, by);
  const states = await fileStates(db);
  const prod = await revisionsById(
    db,
    items.flatMap((i) => {
      const p = states.get(keyOf(i))?.prod_revision_id;
      return p ? [p] : [];
    }),
  );
  const order: Kind[] = ["page", "component", "global", "text"];
  const sorted = [...items].sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  await db.transaction(async (tx) => {
    for (const i of sorted) {
      const r = prod.get(keyOf(i));
      if (!r) {
        if (i.kind === "component") {
          const pages = await usedOn(tx, i.id);
          if (pages.length)
            throw new CmsError(
              "errors.blockInUse",
              undefined,
              pages.map((p) => msg("check.usedOn", { path: p.path })),
            );
        }
        await forget(tx, i.kind, i.id);
        continue;
      }
      await writeWorking(tx, i.kind, i.id, r.deleted ? null : r.data, by);
      await tx.query(
        `update items set status = 'available', owner = null, since = now() where kind = $1 and id = $2`,
        [i.kind, i.id],
      );
    }
  });
}

export type Version = {
  id: number;
  data: unknown;
  deleted: boolean;
  author: string;
  created_at: string;
  message: string;
  checkin_id: number;
  /** Production's version now. */
  production: boolean;
  /** The version in the workflow now, and where. */
  workflow?: Stage;
  /** The releases it went to production in. */
  published: number[];
  /** The working copy is this version. */
  current: boolean;
};

/** A file's versions, newest first: each check-in of it, with what production and the workflow hold marked. */
export async function versions(db: Pg, kind: Kind, id: string): Promise<Version[]> {
  const { rows } = await db.query<Omit<Version, "production" | "workflow" | "published" | "current">>(
    `select r.id, r.data, r.deleted, r.author, r.created_at, c.message, c.id as checkin_id
       from revisions r join checkins c on c.id = r.checkin_id
      where r.kind = $1 and r.entity_id = $2 order by r.id desc`,
    [kind, id],
  );
  const f = (await fileStates(db)).get(`${kind}:${id}`);
  const w = (await workingStates(db)).get(`${kind}:${id}`);
  const published = await productionManifests(db);
  return rows.map((r) => {
    const rid = Number(r.id);
    return {
      ...r,
      id: rid,
      checkin_id: Number(r.checkin_id),
      production: f?.prod_revision_id === rid,
      workflow: f?.status === "in_workflow" && f.revision_id === rid ? (f.stage ?? undefined) : undefined,
      published: published.filter((p) => p.manifest[`${kind}:${id}`] === rid).map((p) => p.id),
      current: !!w && (r.deleted ? w.deleted : !w.deleted && canonical(r.data) === canonical(w.state)),
    };
  });
}

/** A version of a file (yours) as its draft again, for the workflow. Returns the blocks it names that are gone. */
export async function restoreVersion(db: Pg, kind: Kind, id: string, revision: number, by: string) {
  await mustHold(db, kind, id, by);
  const r = (await revisionsById(db, [revision])).get(`${kind}:${id}`);
  if (!r) throw new CmsError("errors.noVersion", { id: revision });
  await writeWorking(db, kind, id, r.deleted ? null : r.data, by);
  if (kind !== "page" || r.deleted) return [];
  const blocks = (r.data as { blocks: string[] }).blocks;
  const work = await workingStates(db);
  return blocks.filter((b) => {
    const c = work.get(`component:${b}`);
    return !c || c.deleted;
  });
}

/** The first content's release, recorded on both sites (they show it). */
export async function recordSeed(db: Pg, release: number, by: string) {
  for (const env of ["preview", "production"] as Env[])
    await recordDeployed(db, env, release, by, "seed", logLine("deploy.seed"));
}
