/**
 * The working copy: what the editors save (drafts) of the pages, components (the blocks), globals and UI texts, and what
 * differs from what was checked in. A page lists its blocks by component id, so a component can stand on more than one
 * page; the snapshot (`buildContent`) puts them in place, as the website reads them.
 */
import { randomUUID } from "node:crypto";
import { checkBlock, check, defaults, fieldsOf, GLOBALS, TYPES } from "./catalog";
import type { Db } from "./db";
import { GLOBAL_KEYS, isPagePath, type L10n, LOCALES, type Page, type SiteContent } from "@/generated/model";

export type Kind = "page" | "component" | "global" | "text";

export interface PageRow {
  id: string;
  path: string;
  status: "active" | "inactive";
  title: L10n;
  description: L10n;
  width: "normal" | "narrow";
  spacing: "compact" | "roomy";
  blocks: string[];
  deleted: boolean;
  updated_at: string;
  updated_by: string;
}

export interface ComponentRow {
  id: string;
  type: string;
  name: string;
  data: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
  updated_by: string;
}

export interface GlobalRow {
  key: string;
  data: Record<string, unknown>;
  updated_at: string;
  updated_by: string;
}

export interface TextRow {
  key: string;
  value: L10n;
  updated_at: string;
  updated_by: string;
}

/** A refusal an editor reads (the route answers it as 400 with these words). */
export class CmsError extends Error {
  constructor(
    message: string,
    readonly details: string[] = [],
  ) {
    super(message);
  }
}

/** JSON with every object's keys in order: what two states are compared by. */
export function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (v && typeof v === "object")
    return `{${Object.keys(v)
      .sort()
      .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  return JSON.stringify(v);
}

export const newId = (prefix: string) => `${prefix}-${randomUUID().slice(0, 8)}`;

// ---- reading -------------------------------------------------------------------------------------------------

export async function listPages(db: Db): Promise<PageRow[]> {
  return (await db.query<PageRow>(`select * from pages order by path`)).rows;
}

export async function getPage(db: Db, id: string): Promise<PageRow | undefined> {
  return (await db.query<PageRow>(`select * from pages where id = $1`, [id])).rows[0];
}

export async function listComponents(db: Db, type?: string): Promise<ComponentRow[]> {
  return (
    await db.query<ComponentRow>(
      type
        ? `select * from components where type = $1 order by name, id`
        : `select * from components order by type, name, id`,
      type ? [type] : [],
    )
  ).rows;
}

export async function getComponent(db: Db, id: string): Promise<ComponentRow | undefined> {
  return (await db.query<ComponentRow>(`select * from components where id = $1`, [id])).rows[0];
}

/** The pages (not deleted) that show [componentId]. */
export async function usedOn(db: Db, componentId: string): Promise<PageRow[]> {
  return (
    await db.query<PageRow>(`select * from pages where not deleted and blocks @> $1::jsonb order by path`, [
      JSON.stringify([componentId]),
    ])
  ).rows;
}

export async function listGlobals(db: Db): Promise<GlobalRow[]> {
  return (await db.query<GlobalRow>(`select * from globals order by key`)).rows;
}

export async function getGlobal(db: Db, key: string): Promise<GlobalRow | undefined> {
  return (await db.query<GlobalRow>(`select * from globals where key = $1`, [key])).rows[0];
}

export async function listTexts(db: Db): Promise<TextRow[]> {
  return (await db.query<TextRow>(`select * from texts order by key`)).rows;
}

// ---- the state an item is checked in with --------------------------------------------------------------------

export const pageState = (p: PageRow) => ({
  path: p.path,
  status: p.status,
  title: p.title,
  description: p.description,
  width: p.width,
  spacing: p.spacing,
  blocks: p.blocks,
});
export const componentState = (c: ComponentRow) => ({ type: c.type, name: c.name, data: c.data });

/** Every item of the working copy as it would be checked in: by `kind:id`, its state and whether it is deleted. */
export async function workingStates(db: Db) {
  const out = new Map<string, { kind: Kind; id: string; state: unknown; deleted: boolean; label: string }>();
  for (const p of await listPages(db))
    out.set(`page:${p.id}`, {
      kind: "page",
      id: p.id,
      state: pageState(p),
      deleted: p.deleted,
      label: p.path,
    });
  for (const c of await listComponents(db))
    out.set(`component:${c.id}`, {
      kind: "component",
      id: c.id,
      state: componentState(c),
      deleted: c.deleted,
      label: `${TYPES[c.type]?.label ?? c.type} · ${c.name || c.id}`,
    });
  for (const g of await listGlobals(db))
    out.set(`global:${g.key}`, {
      kind: "global",
      id: g.key,
      state: g.data,
      deleted: false,
      label: GLOBALS[g.key]?.label ?? g.key,
    });
  for (const t of await listTexts(db))
    out.set(`text:${t.key}`, { kind: "text", id: t.key, state: t.value, deleted: false, label: t.key });
  return out;
}

/** The last checked-in state of every item, by `kind:id`. */
export async function checkedIn(db: Db) {
  const { rows } = await db.query<{
    kind: Kind;
    entity_id: string;
    data: unknown;
    deleted: boolean;
    id: number;
  }>(
    `select distinct on (kind, entity_id) kind, entity_id, data, deleted, id
       from revisions order by kind, entity_id, id desc`,
  );
  return new Map(rows.map((r) => [`${r.kind}:${r.entity_id}`, r]));
}

export type Change = { kind: Kind; id: string; label: string; change: "new" | "changed" | "deleted" };

/** What the working copy has that was not checked in: new, changed or deleted items. */
export async function changes(db: Db): Promise<Change[]> {
  const [work, done] = await Promise.all([workingStates(db), checkedIn(db)]);
  const out: Change[] = [];
  for (const [key, w] of work) {
    const d = done.get(key);
    if (w.deleted) {
      if (d && !d.deleted) out.push({ kind: w.kind, id: w.id, label: w.label, change: "deleted" });
    } else if (!d || d.deleted) out.push({ kind: w.kind, id: w.id, label: w.label, change: "new" });
    else if (canonical(d.data) !== canonical(w.state))
      out.push({ kind: w.kind, id: w.id, label: w.label, change: "changed" });
  }
  const order: Kind[] = ["page", "component", "global", "text"];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.label.localeCompare(b.label));
}

// ---- writing drafts -----------------------------------------------------------------------------------------

/** A page's settings checked: its path free and a page's, its title in languages. */
async function checkPage(db: Db, id: string, p: Partial<PageRow>) {
  const errors: string[] = [];
  if (p.path !== undefined) {
    if (!isPagePath(p.path))
      errors.push(
        `地址「${p.path}」不行：要以 / 开头和结尾，只用小写字母、数字和连字符，且不能是网站自己的页面（账号、登录等）`,
      );
    const taken = (
      await db.query<{ id: string }>(`select id from pages where path = $1 and id <> $2`, [p.path, id])
    ).rows[0];
    if (taken) errors.push(`地址「${p.path}」已经有页面了`);
  }
  if (p.status !== undefined && !["active", "inactive"].includes(p.status))
    errors.push("状态只能是启用或停用");
  if (p.width !== undefined && !["normal", "narrow"].includes(p.width))
    errors.push("宽度只能是 normal 或 narrow");
  if (p.spacing !== undefined && !["compact", "roomy"].includes(p.spacing))
    errors.push("留白只能是 compact 或 roomy");
  const texts = check({ title: p.title, description: p.description }, [
    { name: "title", label: "标题", kind: "text", localized: true, required: p.title !== undefined },
    { name: "description", label: "描述", kind: "textarea", localized: true },
  ]);
  errors.push(...texts.errors);
  if (errors.length) throw new CmsError("页面没有保存", errors);
  return texts.value as { title: L10n; description: L10n };
}

export async function createPage(db: Db, p: { path: string; title: L10n }, by: string, id = newId("page")) {
  const texts = await checkPage(db, id, { path: p.path, title: p.title });
  await db.query(
    `insert into pages (id, path, status, title, description, blocks, updated_by) values ($1, $2, 'inactive', $3, '{}', '[]', $4)`,
    [id, p.path, JSON.stringify(texts.title), by],
  );
  return id;
}

export async function savePage(
  db: Db,
  id: string,
  p: Partial<Omit<PageRow, "id" | "blocks">> & { blocks?: string[] },
  by: string,
) {
  const now = await getPage(db, id);
  if (!now || now.deleted) throw new CmsError("没有这个页面");
  const merged = { ...now, ...p };
  const texts = await checkPage(db, id, merged);
  if (p.blocks) {
    const known = new Set((await listComponents(db)).filter((c) => !c.deleted).map((c) => c.id));
    const unknown = p.blocks.filter((b) => !known.has(b));
    if (unknown.length)
      throw new CmsError(
        "页面没有保存",
        unknown.map((b) => `没有区块 ${b}`),
      );
  }
  await db.query(
    `update pages set path = $2, status = $3, title = $4, description = $5, width = $6, spacing = $7, blocks = $8,
       updated_at = now(), updated_by = $9 where id = $1`,
    [
      id,
      merged.path,
      merged.status,
      JSON.stringify(texts.title),
      JSON.stringify(texts.description),
      merged.width,
      merged.spacing,
      JSON.stringify(merged.blocks),
      by,
    ],
  );
}

export async function deletePage(db: Db, id: string, by: string) {
  await db.query(`update pages set deleted = true, updated_at = now(), updated_by = $2 where id = $1`, [
    id,
    by,
  ]);
}

export async function createComponent(
  db: Db,
  type: string,
  name: string,
  by: string,
  data?: unknown,
  id = newId(type),
) {
  if (!TYPES[type]) throw new CmsError(`没有「${type}」这种区块类型`);
  const checked =
    data === undefined ? { value: defaults(fieldsOf(type)), errors: [] } : checkBlock(type, data);
  if (checked.errors.length) throw new CmsError("区块没有保存", checked.errors);
  await db.query(`insert into components (id, type, name, data, updated_by) values ($1, $2, $3, $4, $5)`, [
    id,
    type,
    name,
    JSON.stringify(checked.value),
    by,
  ]);
  return id;
}

export async function saveComponent(db: Db, id: string, c: { name?: string; data?: unknown }, by: string) {
  const now = await getComponent(db, id);
  if (!now || now.deleted) throw new CmsError("没有这个区块");
  const checked = c.data === undefined ? { value: now.data, errors: [] } : checkBlock(now.type, c.data);
  if (checked.errors.length) throw new CmsError("区块没有保存", checked.errors);
  await db.query(
    `update components set name = $2, data = $3, updated_at = now(), updated_by = $4 where id = $1`,
    [id, c.name ?? now.name, JSON.stringify(checked.value), by],
  );
}

/** A component no page shows any more. */
export async function deleteComponent(db: Db, id: string, by: string) {
  const pages = await usedOn(db, id);
  if (pages.length)
    throw new CmsError(
      "这个区块还在页面上用着",
      pages.map((p) => `用在 ${p.path}`),
    );
  await db.query(`update components set deleted = true, updated_at = now(), updated_by = $2 where id = $1`, [
    id,
    by,
  ]);
}

export async function saveGlobal(db: Db, key: string, data: unknown, by: string) {
  const def = GLOBALS[key];
  if (!def) throw new CmsError(`没有「${key}」这项全局资料`);
  const checked = check(data, def.fields);
  if (checked.errors.length) throw new CmsError(`${def.label}没有保存`, checked.errors);
  await db.query(
    `insert into globals (key, data, updated_by) values ($1, $2, $3)
       on conflict (key) do update set data = $2, updated_at = now(), updated_by = $3`,
    [key, JSON.stringify(checked.value), by],
  );
}

export async function saveText(db: Db, key: string, value: L10n, by: string) {
  if (!/^[A-Za-z][\w-]*(\.[\w-]+)+$/.test(key))
    throw new CmsError(`「${key}」不是界面文字的名字（如 nav.signIn）`);
  const clean: L10n = {};
  for (const l of LOCALES) if (typeof value[l] === "string") clean[l] = value[l];
  await db.query(
    `insert into texts (key, value, updated_by) values ($1, $2, $3)
       on conflict (key) do update set value = $2, updated_at = now(), updated_by = $3`,
    [key, JSON.stringify(clean), by],
  );
}

/** Back to what was checked in; an item never checked in goes. */
export async function discard(db: Db, kind: Kind, id: string, by: string) {
  const last = (await checkedIn(db)).get(`${kind}:${id}`);
  if (kind === "page") {
    if (!last || last.deleted) return void (await db.query(`delete from pages where id = $1`, [id]));
    const s = last.data as ReturnType<typeof pageState>;
    await db.query(
      `update pages set path = $2, status = $3, title = $4, description = $5, width = $6, spacing = $7, blocks = $8,
         deleted = false, updated_at = now(), updated_by = $9 where id = $1`,
      [
        id,
        s.path,
        s.status,
        JSON.stringify(s.title),
        JSON.stringify(s.description),
        s.width,
        s.spacing,
        JSON.stringify(s.blocks),
        by,
      ],
    );
  } else if (kind === "component") {
    if (!last || last.deleted) return void (await db.query(`delete from components where id = $1`, [id]));
    const s = last.data as ReturnType<typeof componentState>;
    await db.query(
      `update components set type = $2, name = $3, data = $4, deleted = false, updated_at = now(), updated_by = $5 where id = $1`,
      [id, s.type, s.name, JSON.stringify(s.data), by],
    );
  } else if (kind === "global") {
    if (!last) return void (await db.query(`delete from globals where key = $1`, [id]));
    await db.query(`update globals set data = $2, updated_at = now(), updated_by = $3 where key = $1`, [
      id,
      JSON.stringify(last.data),
      by,
    ]);
  } else {
    if (!last) return void (await db.query(`delete from texts where key = $1`, [id]));
    await db.query(`update texts set value = $2, updated_at = now(), updated_by = $3 where key = $1`, [
      id,
      JSON.stringify(last.data),
      by,
    ]);
  }
}

// ---- the site as the website reads it -----------------------------------------------------------------------

/**
 * The whole site in [view]: the drafts (the working copy, every page, active or not) or what was checked in. A release
 * takes the checked-in one with the active pages alone ([activeOnly]): an inactive page is never published.
 */
export async function buildContent(
  db: Db,
  view: "draft" | "checked_in",
  o: { activeOnly?: boolean; environment?: SiteContent["environment"] } = {},
): Promise<SiteContent> {
  type PageState = ReturnType<typeof pageState>;
  type CompState = ReturnType<typeof componentState>;
  const pages = new Map<string, PageState>();
  const comps = new Map<string, CompState>();
  const globals: Record<string, unknown> = {};
  const texts: Record<string, L10n> = {};
  if (view === "draft") {
    for (const p of await listPages(db)) if (!p.deleted) pages.set(p.id, pageState(p));
    for (const c of await listComponents(db)) if (!c.deleted) comps.set(c.id, componentState(c));
    for (const g of await listGlobals(db)) globals[g.key] = g.data;
    for (const t of await listTexts(db)) texts[t.key] = t.value;
  } else {
    for (const r of (await checkedIn(db)).values()) {
      if (r.deleted) continue;
      if (r.kind === "page") pages.set(r.entity_id, r.data as PageState);
      else if (r.kind === "component") comps.set(r.entity_id, r.data as CompState);
      else if (r.kind === "global") globals[r.entity_id] = r.data;
      else texts[r.entity_id] = r.data as L10n;
    }
  }
  const out: Page[] = [];
  for (const [id, p] of pages) {
    if (o.activeOnly && p.status !== "active") continue;
    out.push({
      id,
      path: p.path,
      status: p.status,
      title: p.title,
      description: p.description,
      width: p.width,
      spacing: p.spacing,
      blocks: p.blocks.flatMap((b) => {
        const c = comps.get(b);
        return c ? [{ id: b, type: c.type, name: c.name, data: c.data }] : [];
      }),
    });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  for (const k of GLOBAL_KEYS)
    if (!globals[k])
      throw new CmsError(`全局资料「${GLOBALS[k]?.label ?? k}」还没有${view === "draft" ? "" : "签入"}`);
  return {
    format: 1,
    environment: o.environment ?? "cms",
    generated_at: new Date().toISOString(),
    globals: globals as unknown as SiteContent["globals"],
    pages: out,
    texts,
  };
}
