/**
 * The working copy: what the editors save (drafts) of the pages, components (the blocks), templates (the component
 * styles), globals and UI texts (filed by their bundle). A page lists its blocks by component id, so a component can
 * stand on more than one page; a block names its template, or none for its type's own view. The snapshot
 * (`buildContent`) puts them in place, as the website reads them. Every save is refused unless the file is checked out by
 * whoever saves it (files.ts); a file made now is theirs.
 */
import { randomUUID } from "node:crypto";
import { bundleLabel, bundleOf, bundleState } from "./bundles";
import { both, checkBlock, check, defaults, fieldsOf, GLOBALS, ICONS, TYPES } from "./catalog";
import type { Db } from "./db";
import { claimNew, fileStates, type FileRow, KINDS, type Kind, mustHold } from "./files";
import { canonical } from "./json";
import { type Both, CmsError, msg } from "./words";
import {
  GLOBAL_KEYS,
  isPagePath,
  type L10n,
  LOCALES,
  type Page,
  type SiteContent,
  type Template,
} from "@/generated/model";
import { checkTemplate } from "@/generated/template";

export type { Kind } from "./files";

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
  /** The template that draws it (templates.id), or none: its type's own view. */
  template: string | null;
  data: Record<string, unknown>;
  deleted: boolean;
  updated_at: string;
  updated_by: string;
}

export interface TemplateRow {
  id: string;
  type: string;
  name: string;
  markup: string;
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

export { canonical };

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

export async function listTemplates(db: Db, type?: string): Promise<TemplateRow[]> {
  return (
    await db.query<TemplateRow>(
      type
        ? `select * from templates where type = $1 order by name, id`
        : `select * from templates order by type, name, id`,
      type ? [type] : [],
    )
  ).rows;
}

export async function getTemplate(db: Db, id: string): Promise<TemplateRow | undefined> {
  return (await db.query<TemplateRow>(`select * from templates where id = $1`, [id])).rows[0];
}

/** The blocks (not deleted) that [templateId] draws. */
export async function drawnBy(db: Db, templateId: string): Promise<ComponentRow[]> {
  return (
    await db.query<ComponentRow>(
      `select * from components where not deleted and template = $1 order by name, id`,
      [templateId],
    )
  ).rows;
}

// ---- the state a file is checked in with ---------------------------------------------------------------------

export const pageState = (p: PageRow) => ({
  path: p.path,
  status: p.status,
  title: p.title,
  description: p.description,
  width: p.width,
  spacing: p.spacing,
  blocks: p.blocks,
});
/** A block's state: its template only when it names one (a state checked in before templates reads the same). */
export const componentState = (c: Pick<ComponentRow, "type" | "name" | "data" | "template">) => ({
  type: c.type,
  name: c.name,
  ...(c.template ? { template: c.template } : {}),
  data: c.data,
});
export const templateState = (t: TemplateRow): Template => ({ type: t.type, name: t.name, markup: t.markup });

/** A block's or a template's name in both languages: its type's and its own. */
const typedLabel = (c: { type: string; name: string; id: string }): Both => {
  const t = both(TYPES[c.type], c.type);
  const own = c.name || c.id;
  return { zh: `${t.zh} · ${own}`, en: `${t.en} · ${own}` };
};

export type Working = {
  kind: Kind;
  id: string;
  state: unknown;
  deleted: boolean;
  label: Both;
  /** When it was saved last, and by whom. */
  at: string;
  by: string;
};

/** Every file of the working copy as it would be checked in: by `kind:id`, its state and whether it is deleted. */
export async function workingStates(db: Db) {
  const out = new Map<string, Working>();
  const same = (s: string): Both => ({ zh: s, en: s });
  const put = (w: Working) => out.set(`${w.kind}:${w.id}`, w);
  for (const p of await listPages(db))
    put({
      kind: "page",
      id: p.id,
      state: pageState(p),
      deleted: p.deleted,
      label: same(p.path),
      at: p.updated_at,
      by: p.updated_by,
    });
  for (const c of await listComponents(db))
    put({
      kind: "component",
      id: c.id,
      state: componentState(c),
      deleted: c.deleted,
      label: typedLabel(c),
      at: c.updated_at,
      by: c.updated_by,
    });
  for (const t of await listTemplates(db))
    put({
      kind: "template",
      id: t.id,
      state: templateState(t),
      deleted: t.deleted,
      label: typedLabel(t),
      at: t.updated_at,
      by: t.updated_by,
    });
  for (const g of await listGlobals(db))
    put({
      kind: "global",
      id: g.key,
      state: g.data,
      deleted: false,
      label: both(GLOBALS[g.key], g.key),
      at: g.updated_at,
      by: g.updated_by,
    });
  const bundles = new Map<string, TextRow[]>();
  for (const t of await listTexts(db))
    bundles.set(bundleOf(t.key), [...(bundles.get(bundleOf(t.key)) ?? []), t]);
  for (const [ns, texts] of bundles) {
    const last = texts.reduce((a, b) => (new Date(b.updated_at) > new Date(a.updated_at) ? b : a));
    put({
      kind: "bundle",
      id: ns,
      state: bundleState(texts),
      deleted: false,
      label: bundleLabel(ns),
      at: last.updated_at,
      by: last.updated_by,
    });
  }
  return out;
}

export type Revision = { id: number; kind: Kind; entity_id: string; data: unknown; deleted: boolean };

/** Revisions by their ids, by `kind:id`. */
export async function revisionsById(db: Db, ids: number[]): Promise<Map<string, Revision>> {
  if (!ids.length) return new Map();
  const { rows } = await db.query<Revision>(
    `select id, kind, entity_id, data, deleted from revisions where id = any($1::bigint[])`,
    [ids],
  );
  return new Map(rows.map((r) => [`${r.kind}:${r.entity_id}`, { ...r, id: Number(r.id) }]));
}

/**
 * The version of every file a site shows: production's, with the files in the workflow that [overlay] picks in their
 * workflow version instead (preview: those at 预览站; the CMS's 已签入: all of them).
 */
export async function revisionsAt(db: Db, overlay: (f: FileRow) => boolean) {
  const ids: number[] = [];
  for (const f of (await fileStates(db)).values()) {
    const id = f.status === "in_workflow" && f.revision_id && overlay(f) ? f.revision_id : f.prod_revision_id;
    if (id) ids.push(id);
  }
  return revisionsById(db, ids);
}

export type Change = { kind: Kind; id: string; label: Both; change: "new" | "changed" | "deleted" };

/** How a working copy differs from its version [base] (production's, by default): new, changed, deleted or the same. */
export function changeOf(w: Working | undefined, base: Revision | undefined): Change["change"] | undefined {
  if (!w) return undefined;
  if (w.deleted) return base && !base.deleted ? "deleted" : undefined;
  if (!base || base.deleted) return "new";
  return canonical(base.data) !== canonical(w.state) ? "changed" : undefined;
}

/** What the working copy has that production hasn't: new, changed or deleted files. */
export async function changes(db: Db): Promise<Change[]> {
  const [work, prod] = await Promise.all([workingStates(db), revisionsAt(db, () => false)]);
  const out: Change[] = [];
  for (const [key, w] of work) {
    const change = changeOf(w, prod.get(key));
    if (change) out.push({ kind: w.kind, id: w.id, label: w.label, change });
  }
  return out.sort(
    (a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.label.zh.localeCompare(b.label.zh),
  );
}

// ---- writing drafts -----------------------------------------------------------------------------------------

/** A page's settings checked: its path free and a page's, its title in languages. */
async function checkPage(db: Db, id: string, p: Partial<PageRow>) {
  const errors = [];
  if (p.path !== undefined) {
    if (!isPagePath(p.path)) errors.push(msg("check.pagePath", { path: p.path }));
    const taken = (
      await db.query<{ id: string }>(`select id from pages where path = $1 and id <> $2`, [p.path, id])
    ).rows[0];
    if (taken) errors.push(msg("check.pathTaken", { path: p.path }));
  }
  if (p.status !== undefined && !["active", "inactive"].includes(p.status))
    errors.push(msg("check.pageStatus"));
  if (p.width !== undefined && !["normal", "narrow"].includes(p.width)) errors.push(msg("check.pageWidth"));
  if (p.spacing !== undefined && !["compact", "roomy"].includes(p.spacing))
    errors.push(msg("check.pageSpacing"));
  const texts = check({ title: p.title, description: p.description }, [
    { name: "title", label: "标题", kind: "text", localized: true, required: p.title !== undefined },
    { name: "description", label: "描述", kind: "textarea", localized: true },
  ]);
  errors.push(...texts.errors);
  if (errors.length) throw new CmsError("errors.pageNotSaved", undefined, errors);
  return texts.value as { title: L10n; description: L10n };
}

export async function createPage(db: Db, p: { path: string; title: L10n }, by: string, id = newId("page")) {
  const texts = await checkPage(db, id, { path: p.path, title: p.title });
  await db.query(
    `insert into pages (id, path, status, title, description, blocks, updated_by) values ($1, $2, 'inactive', $3, '{}', '[]', $4)`,
    [id, p.path, JSON.stringify(texts.title), by],
  );
  await claimNew(db, "page", id, by);
  return id;
}

export async function savePage(
  db: Db,
  id: string,
  p: Partial<Omit<PageRow, "id" | "blocks">> & { blocks?: string[] },
  by: string,
) {
  const now = await getPage(db, id);
  if (!now || now.deleted) throw new CmsError("errors.noPage");
  await mustHold(db, "page", id, by);
  const merged = { ...now, ...p };
  const texts = await checkPage(db, id, merged);
  if (p.blocks) {
    const known = new Set((await listComponents(db)).filter((c) => !c.deleted).map((c) => c.id));
    const unknown = p.blocks.filter((b) => !known.has(b));
    if (unknown.length)
      throw new CmsError(
        "errors.pageNotSaved",
        undefined,
        unknown.map((b) => msg("check.noBlock", { id: b })),
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
  await mustHold(db, "page", id, by);
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
  if (!TYPES[type]) throw new CmsError("errors.noType", { type });
  const checked =
    data === undefined ? { value: defaults(fieldsOf(type)), errors: [] } : checkBlock(type, data);
  if (checked.errors.length) throw new CmsError("errors.blockNotSaved", undefined, checked.errors);
  await db.query(`insert into components (id, type, name, data, updated_by) values ($1, $2, $3, $4, $5)`, [
    id,
    type,
    name,
    JSON.stringify(checked.value),
    by,
  ]);
  await claimNew(db, "component", id, by);
  return id;
}

/**
 * A block saved: its name, its data (checked by its type) and the template that draws it ([template]: one of its type's,
 * not deleted; null for its type's own view; left out, as it was).
 */
export async function saveComponent(
  db: Db,
  id: string,
  c: { name?: string; data?: unknown; template?: string | null },
  by: string,
) {
  const now = await getComponent(db, id);
  if (!now || now.deleted) throw new CmsError("errors.noBlock");
  await mustHold(db, "component", id, by);
  const checked = c.data === undefined ? { value: now.data, errors: [] } : checkBlock(now.type, c.data);
  const template = c.template === undefined ? now.template : c.template || null;
  if (template) {
    const t = await getTemplate(db, template);
    if (!t || t.deleted || t.type !== now.type)
      checked.errors.push(msg("check.noTemplate", { id: template }));
  }
  if (checked.errors.length) throw new CmsError("errors.blockNotSaved", undefined, checked.errors);
  await db.query(
    `update components set name = $2, data = $3, template = $4, updated_at = now(), updated_by = $5 where id = $1`,
    [id, c.name ?? now.name, JSON.stringify(checked.value), template, by],
  );
}

/** A component no page shows any more. */
export async function deleteComponent(db: Db, id: string, by: string) {
  await mustHold(db, "component", id, by);
  const pages = await usedOn(db, id);
  if (pages.length)
    throw new CmsError(
      "errors.blockInUse",
      undefined,
      pages.map((p) => msg("check.usedOn", { path: p.path })),
    );
  await db.query(`update components set deleted = true, updated_at = now(), updated_by = $2 where id = $1`, [
    id,
    by,
  ]);
}

export async function saveGlobal(db: Db, key: string, data: unknown, by: string) {
  const def = GLOBALS[key];
  if (!def) throw new CmsError("errors.noGlobal", { key });
  if (await getGlobal(db, key)) await mustHold(db, "global", key, by);
  else await claimNew(db, "global", key, by);
  const checked = check(data, def.fields);
  if (checked.errors.length)
    throw new CmsError("errors.globalNotSaved", { label: both(def, key) }, checked.errors);
  await db.query(
    `insert into globals (key, data, updated_by) values ($1, $2, $3)
       on conflict (key) do update set data = $2, updated_at = now(), updated_by = $3`,
    [key, JSON.stringify(checked.value), by],
  );
}

// ---- templates (the component styles) ----------------------------------------------------------------------------

/**
 * Every problem with [markup] as a template for blocks of [type]: the markup's, its fields', its UI texts' and icons'.
 * Tags and code go into a message as its values (a message holds no tag and no brace of its own: next-intl reads them).
 */
export async function templateProblems(db: Db, type: string, markup: string) {
  const texts = new Set((await listTexts(db)).map((t) => t.key));
  return checkTemplate(markup, fieldsOf(type), { texts, icons: ICONS }).map((p) => {
    const v: Record<string, string | number> = { ...p.values };
    for (const k of ["tag", "open", "parent"]) if (typeof v[k] === "string") v[k] = `<${v[k]}>`;
    if (typeof p.values.tag === "string") v.close = `</${p.values.tag}>`;
    if (typeof v.allowed === "string")
      v.allowed = v.allowed
        .split(", ")
        .map((x) => `<${x}>`)
        .join(" ");
    if (p.code === "badBinding") Object.assign(v, { example: "{title}", braces: "{{ }}" });
    return msg(`markup.${p.code}`, v);
  });
}

/** A new template of [type] (its markup checked), checked out to [by]. */
export async function createTemplate(
  db: Db,
  type: string,
  name: string,
  markup: string,
  by: string,
  id = newId("tpl"),
) {
  if (!TYPES[type]) throw new CmsError("errors.noType", { type });
  if (!name.trim()) throw new CmsError("errors.templateName");
  const problems = await templateProblems(db, type, markup);
  if (problems.length) throw new CmsError("errors.templateNotSaved", undefined, problems);
  await db.query(`insert into templates (id, type, name, markup, updated_by) values ($1, $2, $3, $4, $5)`, [
    id,
    type,
    name.trim(),
    markup,
    by,
  ]);
  await claimNew(db, "template", id, by);
  return id;
}

export async function saveTemplate(db: Db, id: string, t: { name?: string; markup?: string }, by: string) {
  const now = await getTemplate(db, id);
  if (!now || now.deleted) throw new CmsError("errors.noTemplate", { id });
  await mustHold(db, "template", id, by);
  const name = (t.name ?? now.name).trim();
  if (!name) throw new CmsError("errors.templateName");
  const markup = t.markup ?? now.markup;
  const problems = await templateProblems(db, now.type, markup);
  if (problems.length) throw new CmsError("errors.templateNotSaved", undefined, problems);
  await db.query(
    `update templates set name = $2, markup = $3, updated_at = now(), updated_by = $4 where id = $1`,
    [id, name, markup, by],
  );
}

/** A template no block uses any more. */
export async function deleteTemplate(db: Db, id: string, by: string) {
  await mustHold(db, "template", id, by);
  const blocks = await drawnBy(db, id);
  if (blocks.length)
    throw new CmsError(
      "errors.templateInUse",
      undefined,
      blocks.map((b) => msg("check.drawsBlock", { label: typedLabel(b) })),
    );
  await db.query(`update templates set deleted = true, updated_at = now(), updated_by = $2 where id = $1`, [
    id,
    by,
  ]);
}

// ---- the UI texts, by their bundle -----------------------------------------------------------------------------

export const isTextKey = (key: string) => /^[A-Za-z][\w-]*(\.[\w-]+)+$/.test(key);

/** A text saved: its bundle must be yours (a text of a bundle that doesn't exist yet makes it, yours). */
export async function saveText(db: Db, key: string, value: L10n, by: string) {
  if (!isTextKey(key)) throw new CmsError("errors.textKey", { key });
  const ns = bundleOf(key);
  const exists =
    (await db.query(`select 1 from items where kind = 'bundle' and id = $1`, [ns])).rows.length > 0;
  if (exists) await mustHold(db, "bundle", ns, by);
  else await claimNew(db, "bundle", ns, by);
  const clean: L10n = {};
  for (const l of LOCALES) if (typeof value[l] === "string") clean[l] = value[l];
  await db.query(
    `insert into texts (key, value, updated_by) values ($1, $2, $3)
       on conflict (key) do update set value = $2, updated_at = now(), updated_by = $3`,
    [key, JSON.stringify(clean), by],
  );
}

/**
 * The working copy of a file set to a checked-in version: [state], or deleted when [state] is null (a page, a block or a
 * template keeps its row, marked; a global goes; a bundle is its texts). What discarding and restoring a version write;
 * no ownership check.
 */
export async function writeWorking(db: Db, kind: Kind, id: string, state: unknown, by: string) {
  if (kind === "page") {
    if (state === null)
      return void (await db.query(
        `update pages set deleted = true, updated_at = now(), updated_by = $2 where id = $1`,
        [id, by],
      ));
    const s = state as ReturnType<typeof pageState>;
    await db.query(
      `insert into pages (id, path, status, title, description, width, spacing, blocks, deleted, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, false, $9)
       on conflict (id) do update set path = $2, status = $3, title = $4, description = $5, width = $6, spacing = $7,
         blocks = $8, deleted = false, updated_at = now(), updated_by = $9`,
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
    if (state === null)
      return void (await db.query(
        `update components set deleted = true, updated_at = now(), updated_by = $2 where id = $1`,
        [id, by],
      ));
    const s = state as ReturnType<typeof componentState>;
    await db.query(
      `insert into components (id, type, name, template, data, deleted, updated_by) values ($1, $2, $3, $4, $5, false, $6)
       on conflict (id) do update set type = $2, name = $3, template = $4, data = $5, deleted = false, updated_at = now(),
         updated_by = $6`,
      [id, s.type, s.name, s.template ?? null, JSON.stringify(s.data), by],
    );
  } else if (kind === "template") {
    if (state === null)
      return void (await db.query(
        `update templates set deleted = true, updated_at = now(), updated_by = $2 where id = $1`,
        [id, by],
      ));
    const s = state as Template;
    await db.query(
      `insert into templates (id, type, name, markup, deleted, updated_by) values ($1, $2, $3, $4, false, $5)
       on conflict (id) do update set type = $2, name = $3, markup = $4, deleted = false, updated_at = now(), updated_by = $5`,
      [id, s.type, s.name, s.markup, by],
    );
  } else if (kind === "bundle") {
    // The bundle's texts as [state] has them: the others of its namespace go.
    const texts = (state ?? {}) as Record<string, L10n>;
    await db.query(`delete from texts where split_part(key, '.', 1) = $1 and not (key = any($2::text[]))`, [
      id,
      Object.keys(texts),
    ]);
    for (const [key, value] of Object.entries(texts))
      await db.query(
        `insert into texts (key, value, updated_by) values ($1, $2, $3)
           on conflict (key) do update set value = $2, updated_at = now(), updated_by = $3
           where texts.value is distinct from $2::jsonb`,
        [key, JSON.stringify(value), by],
      );
  } else {
    if (state === null) return void (await db.query(`delete from globals where key = $1`, [id]));
    await db.query(
      `insert into globals (key, data, updated_by) values ($1, $2, $3)
         on conflict (key) do update set data = $2, updated_at = now(), updated_by = $3`,
      [id, JSON.stringify(state), by],
    );
  }
}

/** A file made in the CMS and never checked in, gone: its working copy and its state. */
export async function forget(db: Db, kind: Kind, id: string) {
  const where: Record<Kind, string> = {
    page: `delete from pages where id = $1`,
    component: `delete from components where id = $1`,
    template: `delete from templates where id = $1`,
    global: `delete from globals where key = $1`,
    bundle: `delete from texts where split_part(key, '.', 1) = $1`,
  };
  await db.query(where[kind], [id]);
  await db.query(`delete from items where kind = $1 and id = $2`, [kind, id]);
}

// ---- the site as the website reads it -----------------------------------------------------------------------

/** What a site shows, by its name: the drafts, the workflow's (the CMS's 已签入), preview's or production's. */
export type View = "draft" | "workflow" | "preview" | "production";

export const OVERLAYS: Record<Exclude<View, "draft">, (f: FileRow) => boolean> = {
  production: () => false,
  preview: (f) => f.stage === "preview",
  workflow: () => true,
};

type PageState = ReturnType<typeof pageState>;
type CompState = ReturnType<typeof componentState>;

/** The site from these versions of its files (by `kind:id`), as the website reads it. */
export function contentOf(
  revisions: Map<string, Revision>,
  o: { activeOnly?: boolean; environment?: SiteContent["environment"] } = {},
): SiteContent {
  const pages = new Map<string, PageState>();
  const comps = new Map<string, CompState>();
  const templates: Record<string, Template> = {};
  const globals: Record<string, unknown> = {};
  const texts: Record<string, L10n> = {};
  for (const r of revisions.values()) {
    if (r.deleted) continue;
    if (r.kind === "page") pages.set(r.entity_id, r.data as PageState);
    else if (r.kind === "component") comps.set(r.entity_id, r.data as CompState);
    else if (r.kind === "template") templates[r.entity_id] = r.data as Template;
    else if (r.kind === "global") globals[r.entity_id] = r.data;
    else if (r.kind === "bundle") Object.assign(texts, r.data as Record<string, L10n>);
  }
  return assemble(pages, comps, templates, globals, texts, o);
}

function assemble(
  pages: Map<string, PageState>,
  comps: Map<string, CompState>,
  templates: Record<string, Template>,
  globals: Record<string, unknown>,
  texts: Record<string, L10n>,
  o: { activeOnly?: boolean; environment?: SiteContent["environment"] },
): SiteContent {
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
        return c
          ? [{ id: b, type: c.type, name: c.name, ...(c.template && { template: c.template }), data: c.data }]
          : [];
      }),
    });
  }
  out.sort((a, b) => a.path.localeCompare(b.path));
  for (const k of GLOBAL_KEYS)
    if (!globals[k]) throw new CmsError("errors.globalMissing", { label: both(GLOBALS[k], k) });
  return {
    format: 1,
    environment: o.environment ?? "cms",
    generated_at: new Date().toISOString(),
    globals: globals as unknown as SiteContent["globals"],
    pages: out,
    texts,
    templates,
  };
}

/**
 * The whole site in [view]: the drafts (the working copy, every page, active or not), or the files' versions a site
 * shows (workflow.ts). A release takes the active pages alone ([activeOnly]): an inactive page is never published.
 */
export async function buildContent(
  db: Db,
  view: View,
  o: { activeOnly?: boolean; environment?: SiteContent["environment"] } = {},
): Promise<SiteContent> {
  if (view !== "draft") return contentOf(await revisionsAt(db, OVERLAYS[view]), o);
  const pages = new Map<string, PageState>();
  const comps = new Map<string, CompState>();
  const templates: Record<string, Template> = {};
  const globals: Record<string, unknown> = {};
  const texts: Record<string, L10n> = {};
  for (const p of await listPages(db)) if (!p.deleted) pages.set(p.id, pageState(p));
  for (const c of await listComponents(db)) if (!c.deleted) comps.set(c.id, componentState(c));
  for (const t of await listTemplates(db)) if (!t.deleted) templates[t.id] = templateState(t);
  for (const g of await listGlobals(db)) globals[g.key] = g.data;
  for (const t of await listTexts(db)) texts[t.key] = t.value;
  return assemble(pages, comps, templates, globals, texts, o);
}
