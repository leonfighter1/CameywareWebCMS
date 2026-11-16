/**
 * A page's rows (the owner, 2026-11-16, S5, with Bell's page editor: 「we should be able to add new row to the page level,
 * also rows can be drag and drop reordered, row index don't carry … one row can be added multiple components (can be
 * duplicated components as well)」). A page keeps its placements in one list; a row is the placements next to each other
 * in a zone with one row key (the website's `rowsOf`), so a row moves as one and its number is where it stands. Pure
 * functions on that list, for the editor and the server alike; an index is a placement's place in the list as read.
 */
import { rowsOf } from "@/generated/layouts";

type Item = { zone: string; row?: string };

/** A new row's key. */
export const newRowKey = () => `r-${Math.random().toString(36).slice(2, 10)}`;

/** A row of a zone: its key when it has one, and its placements' indexes in the list, in order. */
export type Row = { zone: string; row?: string; at: number[] };

/** [zone]'s rows in [list], in order. */
export function rowsIn(list: Item[], zone: string): Row[] {
  const here = list.map((p, i) => ({ row: p.row, zone: p.zone, i })).filter((p) => p.zone === zone);
  return rowsOf(here).map((r) => ({ zone, row: r[0]!.row, at: r.map((p) => p.i) }));
}

/**
 * Where a placement goes: into [zone]; beside the placements [join] (a row: before [before], one of them, or after the
 * last), or as a row of its own before the row [beforeRow] (the end of the zone when neither), keyed [row] when given (a
 * new row made empty first).
 */
export type Target = { zone: string; join?: number[]; before?: number; beforeRow?: number[]; row?: string };

function place<T extends Item>(list: T[], item: T, to: Target, from?: number): T[] {
  if (to.before !== undefined && to.before === from) return list;
  const copy = list.slice();
  let key = to.row;
  if (to.join?.length) {
    key = copy[to.join[0]!]!.row ?? newRowKey();
    for (const i of to.join) copy[i] = { ...copy[i]!, row: key };
  }
  const put = { ...item, zone: to.zone };
  if (key) put.row = key;
  else delete put.row;
  const others = (ix: number[]) => ix.filter((i) => i !== from);
  let anchor: T | undefined;
  let after = false;
  if (to.join?.length) {
    if (to.before !== undefined && to.join.includes(to.before)) anchor = copy[to.before];
    else {
      const o = others(to.join);
      if (!o.length) return list;
      anchor = copy[o.at(-1)!];
      after = true;
    }
  } else if (to.beforeRow) {
    const o = others(to.beforeRow);
    if (!o.length) return list;
    anchor = copy[o[0]!];
  }
  const rest = from === undefined ? copy : copy.filter((_, i) => i !== from);
  let at: number;
  if (anchor) at = rest.indexOf(anchor) + (after ? 1 : 0);
  else {
    const last = rest.map((p) => p.zone).lastIndexOf(to.zone);
    at = last < 0 ? rest.length : last + 1;
  }
  rest.splice(at, 0, put);
  return rest;
}

/** [list] with [item] placed at [to]. */
export const insertPlacement = <T extends Item>(list: T[], item: T, to: Target) => place(list, item, to);

/** [list] with the placement at [from] moved to [to]: into another row, beside others, or into a row of its own. */
export const moveCard = <T extends Item>(list: T[], from: number, to: Target) =>
  place(list, list[from]!, to, from);

/** [list] with the row [at] moved, all of it, into [zone] before the row [beforeRow] (the end of the zone when none). */
export function moveRow<T extends Item>(
  list: T[],
  at: number[],
  to: { zone: string; beforeRow?: number[] },
): T[] {
  if (to.beforeRow?.some((i) => at.includes(i))) return list;
  const anchor = to.beforeRow?.length ? list[to.beforeRow[0]!] : undefined;
  const moving = at.map((i) => ({ ...list[i]!, zone: to.zone }));
  const rest = list.filter((_, i) => !at.includes(i));
  let pos: number;
  if (anchor) pos = rest.indexOf(anchor);
  else {
    const last = rest.map((p) => p.zone).lastIndexOf(to.zone);
    pos = last < 0 ? rest.length : last + 1;
  }
  rest.splice(pos, 0, ...moving);
  return rest;
}
