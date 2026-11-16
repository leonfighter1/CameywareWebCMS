/**
 * Files and their states (the owner, 2026-11-15: 「每个file有 没有被touch的情况，这样editor可以进行拿取操作，一旦拿取，
 * file/component就进入checkout 状态，此时如果另一个人想要拿回去可以直接take over， 但是一旦当文件进入签入(added to
 * workflow)状态，file就被lock住了」). Every page, block, template (component style), global and resource bundle (the UI
 * texts of a namespace, bundles.ts) is a file:
 *
 *   available    未拿取: nobody's; anyone may take it.
 *   checked_out  拿取: one editor's; only they change it; another may take it over.
 *   in_workflow  工作流: checked in (by its owner), locked: nobody takes or changes it until it leaves the workflow.
 *
 * Only a file checked out by you can be saved, checked in, put back or discarded (workflow.ts moves it on from there).
 */
import type { Db } from "./db";
import { CmsError, type Msg, msg } from "./words";

export type Kind = "page" | "component" | "template" | "layout" | "global" | "bundle" | "code";
export type Item = { kind: Kind; id: string };
export type Status = "available" | "checked_out" | "in_workflow";
export type Stage = "checked_in" | "preview";

export interface FileRow {
  kind: Kind;
  id: string;
  status: Status;
  owner: string | null;
  since: string;
  stage: Stage | null;
  revision_id: number | null;
  checkin_id: number | null;
  prod_revision_id: number | null;
}

export const keyOf = (i: Item) => `${i.kind}:${i.id}`;
/** The kinds in the order lists show them (and a discard undoes them: a page before its blocks, a block before its template). */
export const KINDS: Kind[] = ["page", "component", "template", "layout", "global", "bundle", "code"];

const numbers = (r: FileRow): FileRow => ({
  ...r,
  revision_id: r.revision_id === null ? null : Number(r.revision_id),
  checkin_id: r.checkin_id === null ? null : Number(r.checkin_id),
  prod_revision_id: r.prod_revision_id === null ? null : Number(r.prod_revision_id),
});

/** Every file's state, by `kind:id`. */
export async function fileStates(db: Db): Promise<Map<string, FileRow>> {
  const { rows } = await db.query<FileRow>(`select * from items`);
  return new Map(rows.map((r) => [keyOf(r), numbers(r)]));
}

export async function fileState(db: Db, kind: Kind, id: string): Promise<FileRow | undefined> {
  const r = (await db.query<FileRow>(`select * from items where kind = $1 and id = $2`, [kind, id])).rows[0];
  return r && numbers(r);
}

/** Why [by] may not change [f] (a file's state), or nothing when it is theirs. */
export function refusal(f: FileRow | undefined, by: string, id: string): Msg | undefined {
  if (!f || f.status === "available") return msg("errors.takeFirst", { id });
  if (f.status === "in_workflow") return msg("errors.locked", { id });
  if (f.owner !== by) return msg("errors.othersFile", { id, owner: f.owner ?? "" });
  return undefined;
}

/** Refused unless [by] has checked out the file: what every save starts with. */
export async function mustHold(db: Db, kind: Kind, id: string, by: string) {
  const why = refusal(await fileState(db, kind, id), by, id);
  if (why) throw new CmsError(why.key, why.values);
}

/** A new file (a page, a block, a template, a bundle made now): checked out to whoever made it. */
export async function claimNew(db: Db, kind: Kind, id: string, by: string) {
  await db.query(
    `insert into items (kind, id, status, owner) values ($1, $2, 'checked_out', $3)
       on conflict (kind, id) do update set status = 'checked_out', owner = $3, since = now()`,
    [kind, id, by],
  );
}

/**
 * [items] checked out to [by]: those nobody has, and with [over] those someone else has (接手). Refused whole, with
 * every reason, when any is in the workflow or another's without [over].
 */
export async function take(db: Db, items: Item[], by: string, over = false) {
  if (!items.length) throw new CmsError("errors.nothingChosen");
  const states = await fileStates(db);
  const details: Msg[] = [];
  for (const i of items) {
    const f = states.get(keyOf(i));
    if (!f) details.push(msg("errors.noFile", { id: i.id }));
    else if (f.status === "in_workflow") details.push(msg("errors.locked", { id: i.id }));
    else if (f.status === "checked_out" && f.owner !== by && !over)
      details.push(msg("errors.othersFile", { id: i.id, owner: f.owner ?? "" }));
  }
  if (details.length) throw new CmsError("errors.notTaken", undefined, details);
  for (const i of items)
    await db.query(
      `update items set status = 'checked_out', owner = $3, since = now()
        where kind = $1 and id = $2 and (status <> 'checked_out' or owner <> $3)`,
      [i.kind, i.id, by],
    );
}

/** Refused whole unless every one of [items] is checked out by [by]. */
export async function mustHoldAll(db: Db, items: Item[], by: string) {
  if (!items.length) throw new CmsError("errors.nothingChosen");
  const states = await fileStates(db);
  const details = items.flatMap((i) => {
    const why = refusal(states.get(keyOf(i)), by, i.id);
    return why ? [why] : [];
  });
  if (details.length) throw new CmsError("errors.notYours", undefined, details);
}

/** 放回: [items] nobody's again, their changes kept (the next one to take them finds them). */
export async function putBack(db: Db, items: Item[], by: string) {
  await mustHoldAll(db, items, by);
  for (const i of items)
    await db.query(
      `update items set status = 'available', owner = null, since = now() where kind = $1 and id = $2`,
      [i.kind, i.id],
    );
}
