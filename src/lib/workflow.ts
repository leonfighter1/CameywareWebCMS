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
 *   Production can go back to a release it showed before, as a whole (an emergency), its files' versions with it (its
 *   content: a built-in template's code stays, S6).
 *
 * A step that builds a site moves its files once the site shows them: a failed build leaves them where they were.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db";
import { deploy } from "./deploy";
import {
  fileStates,
  type FileRow,
  type Item,
  KINDS,
  keyOf,
  mustHold,
  mustHoldAll,
  type Stage,
  take,
} from "./files";
import {
  busyItems,
  createRelease,
  type Env,
  environments,
  logLine,
  manifestsOn,
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
  inactivePage,
  type Kind,
  laidOutBy,
  type Placement,
  styledBy,
  revisionsById,
  usedOn,
  workingStates,
  writeWorking,
} from "./store";
import { type Both, CmsError, type Detail, msg } from "./words";
import { isBuiltinLayout } from "@/generated/layouts";

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
  /** The job it is in (S7), while in the workflow. */
  job?: { id: number; name: string; ticket: string };
  /** When its working copy was saved last, and by whom. */
  at: string;
  by: string;
  /** Deleted in the working copy (a page, a block or a template marked so). */
  deleted: boolean;
  /** A page 停用 in its working copy: neither preview nor production shows it. */
  inactive: boolean;
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
  const jobs = new Map(
    (
      await db.query<{ kind: string; id: string; job_id: number; name: string; ticket: string }>(
        `select f.kind, f.id, f.job_id, j.name, j.ticket from job_files f join jobs j on j.id = f.job_id
          where j.step not in ('done', 'terminated')`,
      )
    ).rows.map((r) => [`${r.kind}:${r.id}`, { id: Number(r.job_id), name: r.name, ticket: r.ticket }]),
  );
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
      job: f.status === "in_workflow" ? jobs.get(key) : undefined,
      at: w.at,
      by: w.by,
      deleted: w.deleted,
      inactive: inactivePage(w),
    });
  }
  return out.sort(
    (a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.label.zh.localeCompare(b.label.zh),
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

/** Of [items], those production lacks (never published, or deleted there). */
async function newOf(db: Pg, items: Item[], states: Map<string, FileRow>) {
  const prod = await revisionsById(
    db,
    items.flatMap((i) => {
      const p = states.get(keyOf(i))?.prod_revision_id;
      return p ? [p] : [];
    }),
  );
  return items.filter((i) => {
    const r = prod.get(keyOf(i));
    return !r || r.deleted;
  });
}

/**
 * What [i] can't be shown without that production lacks: a page's new blocks, the new templates it places them with,
 * its new layout.
 */
async function newPartsOf(db: Pg, i: Item, states: Map<string, FileRow>): Promise<Item[]> {
  if (i.kind !== "page") return [];
  const page = await getPage(db, i.id);
  if (!page) return [];
  const parts: Item[] = [
    ...page.blocks.map((b) => ({ kind: "component" as const, id: b.id })),
    ...[...new Set(page.blocks.flatMap((b) => (b.style ? [b.style] : [])))].map((id) => ({
      kind: "template" as const,
      id,
    })),
    ...(isBuiltinLayout(page.layout) ? [] : [{ kind: "layout" as const, id: page.layout }]),
  ];
  return newOf(db, parts, states);
}

/** A file that files need and production lacks, how it stands for the one asking, and the files that need it. */
export type Dependency = Item & {
  /** mine: the asker's; free: nobody's; others: someone else's; workflow: in a job already; gone: no longer there. */
  state: "mine" | "free" | "others" | "workflow" | "gone";
  owner?: string;
  from: Item[];
};

/**
 * 依赖 (the owner, 2026-11-16: 「可以用 dependency(依赖)去指代, 比如放到下面， 自动打勾」, 「默认自动打勾 和checkout」):
 * what [items] can't be shown without that production lacks (a page's new blocks, the new styles it places them with,
 * its new layout), each once, with the files among [items] that need it. 我的文件 lists them under the files they come
 * from; taking a page takes those nobody holds (takeTheirParts); a check-in takes them along.
 */
export async function dependencies(db: Pg, items: Item[], author: string): Promise<Dependency[]> {
  const states = await fileStates(db);
  const found = new Map<string, Dependency>();
  for (const from of items)
    for (const part of await newPartsOf(db, from, states)) {
      const known = found.get(keyOf(part));
      const by = { kind: from.kind, id: from.id };
      if (known) {
        if (!known.from.some((f) => keyOf(f) === keyOf(by))) known.from.push(by);
        continue;
      }
      const f = states.get(keyOf(part));
      found.set(keyOf(part), {
        ...part,
        state: !f
          ? "gone"
          : f.status === "in_workflow"
            ? "workflow"
            : f.status === "available"
              ? "free"
              : f.owner === author
                ? "mine"
                : "others",
        owner: f?.owner ?? undefined,
        from: [by],
      });
    }
  return [...found.values()];
}

/** The files [items] need that nobody holds, taken for [by] (依赖, ticked by default); those taken. */
export async function takeTheirParts(db: Pg, items: Item[], by: string): Promise<Item[]> {
  const free = (await dependencies(db, items, by))
    .filter((d) => d.state === "free")
    .map(({ kind, id }) => ({ kind, id }));
  if (free.length) await take(db, free, by);
  return free;
}

/**
 * 签入: [items], every one checked out by [author], into the workflow at 已签入 with [message], with their dependencies:
 * nobody's are taken for [author] (the owner: 「当然也可以自动」); one someone else holds, or one gone, refuses it, by
 * its name and where to take it over.
 */
export async function checkIn(db: Pg, items: Item[], message: string, author: string): Promise<number> {
  if (!message.trim()) throw new CmsError("errors.checkinMessage");
  await mustHoldAll(db, items, author);
  const given = new Set(items.map(keyOf));
  const deps = (await dependencies(db, items, author)).filter((d) => !given.has(keyOf(d)));
  const blocked = deps.filter((d) => d.state === "others" || d.state === "gone");
  if (blocked.length) {
    const work = await workingStates(db);
    const name = (i: Item) => work.get(keyOf(i))?.label ?? { zh: i.id, en: i.id };
    const problems: Detail[] = blocked.map((o) =>
      o.state === "gone"
        ? msg("errors.partGone", { id: o.id })
        : o.kind === "template"
          ? msg("errors.templateNotComing", { template: name(o), owner: o.owner ?? "" })
          : o.kind === "layout"
            ? msg("errors.layoutNotComing", { layout: name(o), owner: o.owner ?? "" })
            : msg("errors.blockNotComing", { block: name(o), owner: o.owner ?? "" }),
    );
    throw new CmsError("errors.checkinIncomplete", undefined, problems);
  }
  const along = deps
    .filter((d) => d.state === "mine" || d.state === "free")
    .map(({ kind, id }) => ({ kind, id }));
  const free = deps.filter((d) => d.state === "free").map(({ kind, id }) => ({ kind, id }));
  return db.transaction(async (tx) => {
    if (free.length) await take(tx, free, author);
    const list = [...items.map(({ kind, id }) => ({ kind, id })), ...along];
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

/**
 * [items] with the new parts that wait at [stage] too (a page's new blocks, their new templates): a page never goes on
 * without them.
 */
export async function withTheirParts(db: Pg, items: Item[], stage: Stage, states: Map<string, FileRow>) {
  const out = new Map(items.map((i) => [keyOf(i), i]));
  const queue = [...items];
  while (queue.length)
    for (const part of await newPartsOf(db, queue.shift()!, states)) {
      const f = states.get(keyOf(part));
      if (!out.has(keyOf(part)) && f?.status === "in_workflow" && f.stage === stage) {
        out.set(keyOf(part), part);
        queue.push(part);
      }
    }
  return [...out.values()];
}

/**
 * 终止 (W1): back to whoever checked them in, checked out, their changes kept; the new parts checked in with them (a
 * page's new blocks, a block's new template) too.
 */
export async function terminate(db: Pg, items: Item[]): Promise<Item[]> {
  const states = await mustBeAt(db, items, "checked_in");
  const moving = await withTheirParts(db, items, "checked_in", states);
  await giveBack(db, moving);
  return moving;
}

/** [items] out of the workflow: checked out again by whoever checked them in, their changes kept. */
export async function giveBack(db: Db, items: Item[]) {
  for (const i of items)
    await db.query(
      `update items set status = 'checked_out', stage = null, revision_id = null, checkin_id = null, since = now()
        where kind = $1 and id = $2`,
      [i.kind, i.id],
    );
}

type Runner = (log: (s: string) => void) => Promise<void>;
/** What else a step's success does, in the same go as moving its files (a job's step and history, jobs.ts). */
type Also = (pg: Pg) => Promise<void>;
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
export async function toPreview(db: Pg, items: Item[], by: string, note = "", runner?: Runner, also?: Also) {
  const states = await mustBeAt(db, items, "checked_in");
  const moving = await withTheirParts(db, items, "checked_in", states);
  const chosen = inList(moving);
  const release = await createRelease(db, by, note, (f) => f.stage === "preview" || chosen(f));
  const { id, done } = await deploy("preview", release, by, {
    action: "preview",
    items: moving,
    runner,
    onSuccess: async (pg) => {
      await moveFrom(pg, moving, "checked_in", `stage = 'preview'`);
      await also?.(pg);
    },
  });
  return { release, deployment: id, items: moving, done };
}

/**
 * 退回签入 (W2): preview built again without [items] and the new parts that went there with them; at 已签入 again once
 * built, still locked.
 */
export async function backToCheckIn(db: Pg, items: Item[], by: string, runner?: Runner, also?: Also) {
  const states = await mustBeAt(db, items, "preview");
  const moving = await withTheirParts(db, items, "preview", states);
  const leaving = inList(moving);
  const release = await createRelease(db, by, "", (f) => f.stage === "preview" && !leaving(f));
  const { id, done } = await deploy("preview", release, by, {
    action: "back",
    items: moving,
    runner,
    onSuccess: async (pg) => {
      await moveFrom(pg, moving, "preview", `stage = 'checked_in'`);
      await also?.(pg);
    },
  });
  return { release, deployment: id, items: moving, done };
}

/**
 * 推到正式站: production's files with [items] (at 预览站) alone, committed and pushed; once pushed each is production's
 * version, nobody's. The other files at 预览站 stay there: preview's versions reach no further than preview.
 */
export async function toProduction(
  db: Pg,
  items: Item[],
  by: string,
  note = "",
  runner?: Runner,
  also?: Also,
) {
  const states = await mustBeAt(db, items, "preview");
  const moving = await withTheirParts(db, items, "preview", states);
  const release = await createRelease(db, by, note, inList(moving));
  const { id, done } = await deploy("production", release, by, {
    action: "production",
    items: moving,
    runner,
    onSuccess: async (pg) => {
      await moveFrom(
        pg,
        moving,
        "preview",
        `prod_revision_id = revision_id, status = 'available', owner = null, stage = null, revision_id = null,
         checkin_id = null`,
      );
      await also?.(pg);
    },
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
        // Built-in templates stay as production has them (the rollback sends content alone): one goes back by its
        // version restored and pushed again.
        if (f.kind === "code" || next === f.prod_revision_id) continue;
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
 * your pages, or a new template still drawing a block, refuses it, unless that page or block goes back too.
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
  const sorted = [...items].sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
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
        if (i.kind === "template" || i.kind === "layout") {
          const pages = await (i.kind === "template" ? styledBy(tx, i.id) : laidOutBy(tx, i.id));
          if (pages.length)
            throw new CmsError(
              i.kind === "template" ? "errors.templateInUse" : "errors.layoutInUse",
              undefined,
              pages.map((p) =>
                msg(i.kind === "template" ? "check.styledOn" : "check.usedOn", { path: p.path }),
              ),
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
  /**
   * The releases it was on preview in (the owner, 2026-11-16: 「everytime you pushed to preview, your version change is
   * kept」): each check-in is a version, so one that went to preview can be found and restored like any other.
   */
  previewed: number[];
  /** The working copy is this version. */
  current: boolean;
};

/** A file's versions, newest first: each check-in of it, with what production and the workflow hold marked. */
export async function versions(db: Pg, kind: Kind, id: string): Promise<Version[]> {
  const { rows } = await db.query<
    Omit<Version, "production" | "workflow" | "published" | "previewed" | "current">
  >(
    `select r.id, r.data, r.deleted, r.author, r.created_at, c.message, c.id as checkin_id
       from revisions r join checkins c on c.id = r.checkin_id
      where r.kind = $1 and r.entity_id = $2 order by r.id desc`,
    [kind, id],
  );
  const f = (await fileStates(db)).get(`${kind}:${id}`);
  const w = (await workingStates(db)).get(`${kind}:${id}`);
  const [published, previewed] = await Promise.all([
    manifestsOn(db, "production"),
    manifestsOn(db, "preview"),
  ]);
  return rows.map((r) => {
    const rid = Number(r.id);
    return {
      ...r,
      id: rid,
      checkin_id: Number(r.checkin_id),
      production: f?.prod_revision_id === rid,
      workflow: f?.status === "in_workflow" && f.revision_id === rid ? (f.stage ?? undefined) : undefined,
      published: published.filter((p) => p.manifest[`${kind}:${id}`] === rid).map((p) => p.id),
      previewed: previewed.filter((p) => p.manifest[`${kind}:${id}`] === rid).map((p) => p.id),
      current: !!w && (r.deleted ? w.deleted : !w.deleted && canonical(r.data) === canonical(w.state)),
    };
  });
}

/**
 * A version of a file (yours) as its draft again, for the workflow. Returns what it names that is gone: a page's blocks,
 * their styles, its layout.
 */
export async function restoreVersion(db: Pg, kind: Kind, id: string, revision: number, by: string) {
  await mustHold(db, kind, id, by);
  const r = (await revisionsById(db, [revision])).get(`${kind}:${id}`);
  if (!r) throw new CmsError("errors.noVersion", { id: revision });
  await writeWorking(db, kind, id, r.deleted ? null : r.data, by);
  if (r.deleted || kind !== "page") return [];
  const page = r.data as { layout: string; blocks: Placement[] };
  const names = [
    ...page.blocks.map((b) => `component:${b.id}`),
    ...page.blocks.flatMap((b) => (b.style ? [`template:${b.style}`] : [])),
    ...(isBuiltinLayout(page.layout) ? [] : [`layout:${page.layout}`]),
  ];
  const work = await workingStates(db);
  return names
    .filter((k) => {
      const w = work.get(k);
      return !w || w.deleted;
    })
    .map((k) => k.slice(k.indexOf(":") + 1));
}

/** The first content's release, recorded on both sites (they show it). */
export async function recordSeed(db: Pg, release: number, by: string) {
  for (const env of ["preview", "production"] as Env[])
    await recordDeployed(db, env, release, by, "seed", logLine("deploy.seed"));
}
