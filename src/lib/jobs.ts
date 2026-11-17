/**
 * Workflow jobs (S7; the owner, 2026-11-16, with Bell's Workflow Job Manager: 「我们需要可以知道自己有哪些文件可以添加到
 * workflow里去，workflow可以有多个 … workflow必须实例化，可以把自己checkoutfile都新建不同的workflow ticket去deploy」; on the
 * questions: approval 「可以」, a time for production 「可以设置也可以跳过」, the ticket 「可以不填」, no mail: 「只需要相关
 * 人员登陆时右上角有一个小铃铛的notification 提醒用户workflow approve」). A job is checked-out files checked in together
 * under a name (a ticket if any), moving on as one:
 *
 *   进行中 progress    checked in and locked (the CMS's preview shows them): files added, removed, split off; 终止
 *   预览站 preview     built into preview.cameyware.com: 提交审批, 退回进行中, split off
 *   待审批 submitted   管理员 and up: 批准, or 退回 to 预览站 with why
 *   已批准 approved    发布 now, or at a time; 退回
 *   已定时 scheduled   published by the CMS at its time (start.ts asks each minute); 取消定时
 *   已完成 done        production's now
 *   已终止 terminated  its files back to whoever checked them in
 *
 * Its files move by the workflow's steps (workflow.ts): a page takes its new parts along, and such a part held by another
 * job joins this one. Every step is an event: the job's history, and the bell's news for its author and its approver.
 */
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db";
import { fileStates, type Item, keyOf } from "./files";
import { busyItems, deploymentById } from "./releases";
import {
  backToCheckIn,
  checkIn,
  giveBack,
  terminate,
  toPreview,
  toProduction,
  withTheirParts,
} from "./workflow";
import { CmsError } from "./words";

type Pg = PGlite;

export const STEPS = [
  "progress",
  "preview",
  "submitted",
  "approved",
  "scheduled",
  "done",
  "terminated",
] as const;
export type Step = (typeof STEPS)[number];
/** The steps of a job not ended. */
export const OPEN: Step[] = ["progress", "preview", "submitted", "approved", "scheduled"];

export type Job = {
  id: number;
  ticket: string;
  name: string;
  author: string;
  step: Step;
  /** Who approved it (or sent it back). */
  approver: string | null;
  scheduled_at: string | null;
  created_at: string;
  updated_at: string;
  /** How many files it holds (or held, once ended). */
  files: number;
};
/** What happened to a job (its history; messages jobs.events). */
export type EventAction =
  | "created"
  | "added"
  | "removed"
  | "split"
  | "splitFrom"
  | "terminated"
  | "gave"
  | "preview"
  | "back"
  | "submitted"
  | "approved"
  | "rejected"
  | "scheduled"
  | "unscheduled"
  | "published"
  | "failed";
export type JobEvent = {
  id: number;
  job_id: number;
  action: EventAction;
  by: string;
  note: string;
  at: string;
};
/** Who does a step: their login, and whether they may approve and publish (管理员 and up). */
export type Actor = { login: string; publisher: boolean };
/** The author of what the CMS does at a job's time. */
export const SCHEDULER = "scheduler";

const asJob = (j: Job): Job => ({ ...j, id: Number(j.id), files: Number(j.files ?? 0) });
const JOB = `select j.*, (select count(*) from job_files f where f.job_id = j.id)::int as files from jobs j`;

export async function getJob(db: Db, id: number): Promise<Job | undefined> {
  const j = (await db.query<Job>(`${JOB} where j.id = $1`, [id])).rows[0];
  return j && asJob(j);
}

/** The files job [id] holds (or held). */
export async function jobItems(db: Db, id: number): Promise<Item[]> {
  return (await db.query<Item>(`select kind, id from job_files where job_id = $1 order by kind, id`, [id]))
    .rows;
}

/** A job's history, newest first. */
export async function jobEvents(db: Db, id: number): Promise<JobEvent[]> {
  const { rows } = await db.query<JobEvent>(`select * from job_events where job_id = $1 order by id desc`, [
    id,
  ]);
  return rows.map((e) => ({ ...e, id: Number(e.id), job_id: Number(e.job_id) }));
}

async function event(db: Db, job: number, action: EventAction, by: string, note = "") {
  await db.query(`insert into job_events (job_id, action, by, note) values ($1, $2, $3, $4)`, [
    job,
    action,
    by,
    note,
  ]);
  await db.query(`update jobs set updated_at = now() where id = $1`, [job]);
}

/** Job [id] at one of [steps], to be moved by [actor]: its author or 管理员 and up; with [publisher], 管理员 and up alone. */
async function mustStep(db: Db, id: number, steps: Step[], actor: Actor, publisher = false): Promise<Job> {
  const job = await getJob(db, id);
  if (!job) throw new CmsError("errors.noJob", { id });
  if (publisher ? !actor.publisher : !actor.publisher && job.author !== actor.login)
    throw new CmsError(publisher ? "errors.onlyPublishers" : "errors.notYourJob", { id, author: job.author });
  if (!steps.includes(job.step)) throw new CmsError("errors.jobStep", { id, step: job.step });
  return job;
}

/** Refused unless every one of [items] is in job [id]. */
async function mustBeIn(db: Db, id: number, items: Item[]) {
  if (!items.length) throw new CmsError("errors.nothingChosen");
  const held = new Set((await jobItems(db, id)).map(keyOf));
  const out = items.filter((i) => !held.has(keyOf(i)));
  if (out.length)
    throw new CmsError(
      "errors.notInJob",
      { id },
      out.map((i) => i.id),
    );
}

/** The check-in's message: the ticket before the name. */
const label = (o: { ticket: string; name: string }) => (o.ticket ? `${o.ticket} · ${o.name}` : o.name);

const NEXT_ID = `(select coalesce(max(id), 0) + 1 from jobs)`;

/**
 * 新建任务: [items] (checked out by [by]) checked in as a new job at 进行中, with a page's new parts of [by]'s
 * (workflow.ts checkIn); its id.
 */
export async function createJob(db: Pg, o: { ticket?: string; name: string }, items: Item[], by: string) {
  const name = o.name.trim();
  const ticket = (o.ticket ?? "").trim();
  if (!name) throw new CmsError("errors.jobName");
  const checkin = await checkIn(db, items, label({ ticket, name }), by);
  const { rows } = await db.query<{ id: number }>(
    // Numbered one after the last (people read these numbers).
    `insert into jobs (id, ticket, name, author, step) values (${NEXT_ID}, $1, $2, $3, 'progress') returning id`,
    [ticket, name, by],
  );
  const id = Number(rows[0]!.id);
  await db.query(
    `insert into job_files (job_id, kind, id) select $1, kind, id from items where checkin_id = $2`,
    [id, checkin],
  );
  await event(db, id, "created", by);
  return id;
}

/**
 * 加到任务: [actor]'s checked-out [items] checked in into job [id] at 进行中: one of theirs, or someone else's (the owner,
 * 2026-11-16: 「可以添加到已有的workflow也可以添加到别人的workflow里 … 第三个tab是添加到其他人的workflow」). The files go
 * back to [actor] if they leave the job.
 */
export async function addToJob(db: Pg, id: number, items: Item[], actor: Actor) {
  const job = await getJob(db, id);
  if (!job) throw new CmsError("errors.noJob", { id });
  if (job.step !== "progress") throw new CmsError("errors.jobStep", { id, step: job.step });
  const checkin = await checkIn(db, items, label(job), actor.login);
  const { rows } = await db.query(
    `insert into job_files (job_id, kind, id) select $1, kind, id from items where checkin_id = $2
       on conflict do nothing returning id`,
    [id, checkin],
  );
  await event(db, id, "added", actor.login, String(rows.length));
}

/**
 * 从任务移除: [items] of job [id] back to whoever checked them in, with their new parts (the owner: 「也可以移除」). At
 * 进行中 at once; at 预览站 once preview is built again without them (the job stays there with the rest).
 */
export async function removeFromJob(db: Pg, id: number, items: Item[], actor: Actor, runner?: Runner) {
  const job = await mustStep(db, id, ["progress", "preview"], actor);
  await mustBeIn(db, id, items);
  const leave = async (pg: Pg, moved: Item[]) => {
    for (const i of moved)
      await pg.query(`delete from job_files where job_id = $1 and kind = $2 and id = $3`, [id, i.kind, i.id]);
    await event(pg, id, "removed", actor.login, String(moved.length));
  };
  if (job.step === "progress") {
    const moved = await terminate(db, items);
    await leave(db, moved);
    return { moved, deployment: undefined, done: Promise.resolve() };
  }
  const own = new Set((await jobItems(db, id)).map(keyOf));
  const moving = (await withTheirParts(db, items, "preview", await fileStates(db))).filter((i) =>
    own.has(keyOf(i)),
  );
  if (moving.length === own.size) throw new CmsError("errors.removeAllPreview", { id });
  const started = await deployStep(
    db,
    job,
    actor,
    "remove",
    (also) => backToCheckIn(db, moving, actor.login, runner, also),
    async (pg) => {
      await giveBack(pg, moving);
      await leave(pg, moving);
    },
    false,
  );
  return { moved: moving, ...started };
}

/** 拆成新任务: [items] of job [id] (at 进行中 or 预览站), with their new parts, as a new job at the same step; its id. */
export async function splitJob(
  db: Pg,
  id: number,
  items: Item[],
  o: { ticket?: string; name: string },
  actor: Actor,
) {
  const job = await mustStep(db, id, ["progress", "preview"], actor);
  await mustBeIn(db, id, items);
  const name = o.name.trim();
  if (!name) throw new CmsError("errors.jobName");
  const busy = await busyItems(db);
  if (items.some((i) => busy.has(keyOf(i)))) throw new CmsError("errors.jobBusy", { id });
  const held = await jobItems(db, id);
  const own = new Set(held.map(keyOf));
  const stage = job.step === "progress" ? "checked_in" : "preview";
  const moving = (await withTheirParts(db, items, stage, await fileStates(db))).filter((i) =>
    own.has(keyOf(i)),
  );
  if (moving.length === held.length) throw new CmsError("errors.splitAll");
  return db.transaction(async (tx) => {
    const { rows } = await tx.query<{ id: number }>(
      `insert into jobs (id, ticket, name, author, step) values (${NEXT_ID}, $1, $2, $3, $4) returning id`,
      [(o.ticket ?? job.ticket).trim(), name, job.author, job.step],
    );
    const to = Number(rows[0]!.id);
    for (const i of moving)
      await tx.query(`update job_files set job_id = $1 where job_id = $2 and kind = $3 and id = $4`, [
        to,
        id,
        i.kind,
        i.id,
      ]);
    await event(tx, id, "split", actor.login, `#${to}`);
    await event(tx, to, "splitFrom", actor.login, `#${id}`);
    return to;
  });
}

/** 终止 a job at 进行中: its files back to whoever checked them in, their changes kept. */
export async function terminateJob(db: Pg, id: number, actor: Actor) {
  await mustStep(db, id, ["progress"], actor);
  const items = await jobItems(db, id);
  const moved = items.length ? await terminate(db, items) : [];
  await db.query(`update jobs set step = 'terminated', updated_at = now() where id = $1`, [id]);
  await event(db, id, "terminated", actor.login);
  return moved;
}

/** [moved] by a step of job [id]: a part of another open job's (a page's new block) joins this one. */
async function claim(db: Pg, id: number, moved: Item[], by: string) {
  const own = new Set((await jobItems(db, id)).map(keyOf));
  for (const i of moved) {
    if (own.has(keyOf(i))) continue;
    const { rows } = await db.query<{ job_id: number }>(
      `select f.job_id from job_files f join jobs j on j.id = f.job_id
        where f.kind = $1 and f.id = $2 and j.id <> $3 and j.step not in ('done', 'terminated')`,
      [i.kind, i.id, id],
    );
    for (const r of rows) {
      await db.query(`delete from job_files where job_id = $1 and kind = $2 and id = $3`, [
        r.job_id,
        i.kind,
        i.id,
      ]);
      await event(db, Number(r.job_id), "gave", by, `#${id} ${i.id}`);
    }
    await db.query(`insert into job_files (job_id, kind, id) values ($1, $2, $3) on conflict do nothing`, [
      id,
      i.kind,
      i.id,
    ]);
  }
}

type Runner = (log: (s: string) => void) => Promise<void>;
type Started = { deployment: number; items: Item[]; done: Promise<void> };

/**
 * A step that deploys: [run] starts it with [success] for once the site shows the files; the deployment is the job's,
 * and a failure is an event (the job stays where it was).
 */
async function deployStep(
  db: Pg,
  job: Job,
  actor: Actor,
  action: string,
  run: (also: (pg: Pg) => Promise<void>) => Promise<Started>,
  success: (pg: Pg) => Promise<void>,
  /** Parts moved with the files join the job (not when they are leaving it). */
  claimParts = true,
) {
  const r = await run(success);
  if (claimParts) await claim(db, job.id, r.items, actor.login);
  await db.query(`update deployments set job_id = $1 where id = $2`, [job.id, r.deployment]);
  const done = r.done.then(async () => {
    if ((await deploymentById(db, r.deployment))?.status === "failed")
      await event(db, job.id, "failed", actor.login, action);
  });
  return { deployment: r.deployment, items: r.items.length, done };
}

/** A job's files, refused when it has none. */
async function filesOf(db: Pg, id: number) {
  const items = await jobItems(db, id);
  if (!items.length) throw new CmsError("errors.emptyJob", { id });
  return items;
}

/** 推到预览站: job [id] (at 进行中) built into preview; at 预览站 once built. */
export async function jobToPreview(db: Pg, id: number, actor: Actor, note = "", runner?: Runner) {
  const job = await mustStep(db, id, ["progress"], actor);
  const items = await filesOf(db, id);
  return deployStep(
    db,
    job,
    actor,
    "preview",
    (also) => toPreview(db, items, actor.login, note || label(job), runner, also),
    async (pg) => {
      await pg.query(`update jobs set step = 'preview' where id = $1 and step = 'progress'`, [id]);
      await event(pg, id, "preview", actor.login, note);
    },
  );
}

/** 退回进行中: preview built again without job [id]'s files; at 进行中 once built, its approval gone. */
export async function jobBack(db: Pg, id: number, actor: Actor, runner?: Runner) {
  const job = await mustStep(db, id, ["preview", "submitted", "approved"], actor);
  const items = await filesOf(db, id);
  return deployStep(
    db,
    job,
    actor,
    "back",
    (also) => backToCheckIn(db, items, actor.login, runner, also),
    async (pg) => {
      await pg.query(
        `update jobs set step = 'progress', approver = null, scheduled_at = null
          where id = $1 and step in ('preview', 'submitted', 'approved')`,
        [id],
      );
      await event(pg, id, "back", actor.login);
    },
  );
}

/** 提交审批: job [id] (at 预览站) for 管理员 and up to approve. */
export async function submitJob(db: Pg, id: number, actor: Actor, note = "") {
  await mustStep(db, id, ["preview"], actor);
  await db.query(`update jobs set step = 'submitted' where id = $1`, [id]);
  await event(db, id, "submitted", actor.login, note.trim());
}

/** 批准 (管理员 and up): job [id] ready for production. */
export async function approveJob(db: Pg, id: number, actor: Actor, note = "") {
  await mustStep(db, id, ["submitted"], actor, true);
  await db.query(`update jobs set step = 'approved', approver = $2 where id = $1`, [id, actor.login]);
  await event(db, id, "approved", actor.login, note.trim());
}

/** 退回 (管理员 and up): job [id] back to 预览站 with [reason], its approval and its time gone. */
export async function rejectJob(db: Pg, id: number, actor: Actor, reason = "") {
  await mustStep(db, id, ["submitted", "approved", "scheduled"], actor, true);
  await db.query(`update jobs set step = 'preview', approver = $2, scheduled_at = null where id = $1`, [
    id,
    actor.login,
  ]);
  await event(db, id, "rejected", actor.login, reason.trim());
}

/**
 * 发布 (管理员 and up) job [id] (approved): [at] a time ahead → 已定时, published by the CMS then; else to production now,
 * 已完成 once pushed. A failure leaves it approved.
 */
export async function publishJob(
  db: Pg,
  id: number,
  actor: Actor,
  o: { at?: Date | null; note?: string; runner?: Runner } = {},
): Promise<{ scheduled?: string; deployment?: number; items?: number; done?: Promise<void> }> {
  const job = await mustStep(db, id, ["approved"], actor, true);
  if (o.at) {
    if (o.at.getTime() < Date.now() + 60_000) throw new CmsError("errors.scheduleAhead");
    await db.query(`update jobs set step = 'scheduled', scheduled_at = $2 where id = $1`, [
      id,
      o.at.toISOString(),
    ]);
    await event(db, id, "scheduled", actor.login, o.at.toISOString());
    return { scheduled: o.at.toISOString() };
  }
  const items = await filesOf(db, id);
  return deployStep(
    db,
    job,
    actor,
    "production",
    (also) => toProduction(db, items, actor.login, o.note || label(job), o.runner, also),
    async (pg) => {
      await pg.query(`update jobs set step = 'done', scheduled_at = null where id = $1`, [id]);
      await event(pg, id, "published", actor.login, o.note ?? "");
    },
  );
}

/** 取消定时 (管理员 and up): job [id] approved again, not at a time. */
export async function cancelSchedule(db: Pg, id: number, actor: Actor) {
  await mustStep(db, id, ["scheduled"], actor, true);
  await db.query(`update jobs set step = 'approved', scheduled_at = null where id = $1`, [id]);
  await event(db, id, "unscheduled", actor.login);
}

/**
 * The jobs whose time has come, published (start.ts asks each minute). One a production deployment is in the way of
 * waits for the next minute; one that fails stays approved, not at a time (its author and approver are told).
 */
export async function runDue(db: Pg, now = new Date(), runner?: Runner) {
  const { rows } = await db.query<{ id: number }>(
    `select id from jobs where step = 'scheduled' and scheduled_at <= $1 order by scheduled_at, id`,
    [now.toISOString()],
  );
  const started: { id: number; done: Promise<void> }[] = [];
  for (const r of rows) {
    const id = Number(r.id);
    await db.query(`update jobs set step = 'approved' where id = $1`, [id]);
    try {
      const p = await publishJob(db, id, { login: SCHEDULER, publisher: true }, { runner });
      started.push({ id, done: p.done ?? Promise.resolve() });
    } catch (e) {
      // Another deployment to production runs: the next minute.
      await db.query(`update jobs set step = 'scheduled' where id = $1`, [id]);
      if (!(e instanceof CmsError)) throw e;
    }
  }
  return started;
}

// ---- the list and the bell ------------------------------------------------------------------------------------

/** A page of the jobs: [author]'s or all, at [step] (open: not ended), [q] in the ticket, the name or the number. */
export async function jobPage(
  db: Db,
  o: { page: number; size: number; author?: string; step?: Step | "open"; q?: string },
) {
  const q = o.q?.trim().replace(/^#/, "");
  // Each filter matches all when it is null.
  const clause = `where ($1::text is null or j.author = $1)
      and ($2::text is null or ($2 = 'open' and j.step not in ('done', 'terminated')) or j.step = $2)
      and ($3::text is null or j.ticket ilike $3 or j.name ilike $3 or j.id::text = $4)`;
  const filters = [
    o.author ?? null,
    o.step ?? null,
    q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null,
    q ?? null,
  ];
  const total = Number(
    (await db.query<{ n: number }>(`select count(*)::int as n from jobs j ${clause}`, filters)).rows[0]!.n,
  );
  const { rows } = await db.query<Job>(
    `${JOB} ${clause} order by j.updated_at desc, j.id desc limit $5 offset $6`,
    [...filters, o.size, (Math.max(1, o.page) - 1) * o.size],
  );
  return { total, rows: rows.map(asJob) };
}

/** Job [id]'s deployments, newest first. */
export async function jobDeployments(db: Db, id: number) {
  const { rows } = await db.query<{
    id: number;
    env: "preview" | "production";
    action: string;
    status: "running" | "done" | "failed";
    started_at: string;
  }>(
    `select id, env, action, status, started_at from deployments where job_id = $1 order by id desc limit 20`,
    [id],
  );
  return rows.map((d) => ({ ...d, id: Number(d.id) }));
}

/** The jobs at 进行中, everyone's: where 加到任务 can put files (yours first in the dialog, others' on its third tab). */
export async function openJobs(db: Db) {
  return (
    await db.query<Job>(`${JOB} where j.step = 'progress' order by j.updated_at desc, j.id desc`)
  ).rows.map(asJob);
}

export type Bell = {
  /** The jobs waiting for approval (管理员 and up). */
  approvals: { id: number; ticket: string; name: string; author: string; at: string }[];
  /** What others did to [login]'s jobs (theirs, or approved by them), newest first. */
  news: (JobEvent & { name: string; ticket: string; unread: boolean })[];
  unread: number;
};

/** The bell of [login]: the approvals waiting (a [publisher]'s) and the news of their jobs since they last looked. */
export async function bell(db: Db, login: string, publisher: boolean): Promise<Bell> {
  const approvals = publisher
    ? (
        await db.query<{ id: number; ticket: string; name: string; author: string; at: string }>(
          `select id, ticket, name, author, updated_at as at from jobs where step = 'submitted' order by updated_at`,
        )
      ).rows.map((j) => ({ ...j, id: Number(j.id) }))
    : [];
  const seen = Number(
    (await db.query<{ event_id: number }>(`select event_id from seen where login = $1`, [login])).rows[0]
      ?.event_id ?? 0,
  );
  const { rows } = await db.query<JobEvent & { name: string; ticket: string }>(
    `select e.*, j.name, j.ticket from job_events e join jobs j on j.id = e.job_id
      where (j.author = $1 or j.approver = $1) and e.by <> $1 order by e.id desc limit 20`,
    [login],
  );
  const news = rows.map((e) => ({
    ...e,
    id: Number(e.id),
    job_id: Number(e.job_id),
    unread: Number(e.id) > seen,
  }));
  return { approvals, news, unread: news.filter((n) => n.unread).length };
}

/** [login] has seen every event so far. */
export async function markSeen(db: Db, login: string) {
  await db.query(
    `insert into seen (login, event_id) values ($1, (select coalesce(max(id), 0) from job_events))
       on conflict (login) do update set event_id = excluded.event_id`,
    [login],
  );
}
