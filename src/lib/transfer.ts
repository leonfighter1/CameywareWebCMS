/**
 * Download and upload (the owner, 2026-11-15: 「表可以通过上传相应的JSON 或者XML 去更改数据，也可以下载下来去更改」,
 * 「可以通过download and upload 去上传并且新建一个新的url of page」; S4: 「尽量参考这样的xml去搭建内容」): a page, a block, a
 * template, a layout, a global, the UI texts or the whole site, as JSON or XML, both ways. A page goes as Bell's WebPage:
 * its MetaData (address, layout, titles, breadcrumb, sitemap) and its Components, each a zone, an index, the component's
 * file and its style's (paths as the explorer's tree has them: Content/Components/<type>/<id>, Views/Component_Styles/
 * <type>/<template or builtin>, Views/PageLayouts/<layout>). An upload is checked like a save and shown as a plan before
 * anything changes; applied, it goes into the working copy (drafts) for a check-in. A page with an address no page has
 * is a new page (inactive). Each file it changes must be yours or nobody's (it is taken for you then); one someone else
 * holds or in the workflow refuses the upload. A page file of before S4 (its blocks inside it) is still read.
 */
import type { PGlite } from "@electric-sql/pglite";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { bundleLabel, bundleOf } from "./bundles";
import { both, check, checkBlock, GLOBALS, TYPES } from "./catalog";
import type { Db } from "./db";
import { fileStates, type Item, take } from "./files";
import { type Placement, placement, zonesOf } from "./pages";
import {
  canonical,
  componentState,
  createComponent,
  createLayout,
  createPage,
  createTemplate,
  getComponent,
  getGlobal,
  getLayout,
  getPage,
  getTemplate,
  type Kind,
  layoutProblems,
  listComponents,
  listGlobals,
  listLayouts,
  listPages,
  listTemplates,
  listTexts,
  newId,
  type PageRow,
  pageState,
  saveComponent,
  saveGlobal,
  saveLayout,
  savePage,
  saveTemplate,
  saveText,
  templateProblems,
} from "./store";
import { type Both, CmsError, type Detail, msg } from "./words";
import { defaultZone, isBuiltinLayout, isRowKey, layoutOf } from "@/generated/layouts";
import { isL10n, isPagePath, type L10n, LOCALES } from "@/generated/model";

/** A block (a component's content); [template] only in a page file of S3 (its style there). */
type BlockDoc = {
  id?: string;
  type: string;
  name?: string;
  template?: string;
  data: Record<string, unknown>;
};
type TemplateDoc = { id?: string; type: string; name: string; markup: string };
type LayoutDoc = { id?: string; name: string; markup: string };
type PageMeta = {
  id?: string;
  path: string;
  status?: "active" | "inactive";
  title: L10n;
  description?: L10n;
  /** A layout's path or name; a page of before S4 has a spacing instead. */
  layout?: string;
  breadcrumb?: boolean | null;
  sitemap?: boolean;
  width?: string;
  spacing?: string;
};
/**
 * A component placed on a page: its zone, its place in it, the row it shares with the components next to it (S5; none:
 * a row alone), its file's path and its style's.
 */
type ComponentRef = { zone: string; index?: number; row?: string; component: string; style?: string };
type WebPageDoc = { page: PageMeta; components: ComponentRef[] };
/** A page file of before S4: its blocks inside it. */
type PageDoc = { page: PageMeta; blocks: BlockDoc[] };

export type Doc =
  | ({ cms: 1; kind: "webpage" } & WebPageDoc)
  | ({ cms: 1; kind: "page" } & PageDoc)
  | { cms: 1; kind: "component"; component: BlockDoc }
  | { cms: 1; kind: "template"; template: TemplateDoc }
  | { cms: 1; kind: "layout"; layout: LayoutDoc }
  | { cms: 1; kind: "global"; key: string; data: Record<string, unknown> }
  | { cms: 1; kind: "texts"; texts: Record<string, L10n> }
  | {
      cms: 1;
      kind: "site";
      webpages?: WebPageDoc[];
      components?: BlockDoc[];
      pages?: PageDoc[];
      templates?: TemplateDoc[];
      layouts?: LayoutDoc[];
      globals: Record<string, Record<string, unknown>>;
      texts: Record<string, L10n>;
    };

// ---- paths, as the explorer's tree has them --------------------------------------------------------------------

export const componentPath = (type: string, id: string) => `Content/Components/${type}/${id}`;
export const stylePath = (type: string, style?: string) =>
  `Views/Component_Styles/${type}/${style ?? "builtin"}`;
export const layoutPath = (layout: string) => `Views/PageLayouts/${layout}`;

/** A path's last part (its file's id), slashes either way, as Bell's paths are written too. */
const fileOf = (path: string | undefined) => (path ?? "").split(/[\\/]/).filter(Boolean).at(-1) ?? "";

// ---- download ----------------------------------------------------------------------------------------------

async function webPageDoc(db: Db, p: PageRow, types: Map<string, string>): Promise<WebPageDoc> {
  const s = pageState(p);
  const index = new Map<string, number>();
  return {
    page: {
      id: p.id,
      path: s.path,
      status: s.status,
      title: s.title,
      description: s.description,
      layout: layoutPath(s.layout),
      breadcrumb: p.breadcrumb,
      sitemap: p.sitemap,
    },
    components: s.blocks.map((b) => {
      const n = index.get(b.zone) ?? 0;
      index.set(b.zone, n + 1);
      const type = types.get(b.id) ?? "";
      return {
        zone: b.zone,
        index: n,
        ...(b.row && { row: b.row }),
        component: componentPath(type, b.id),
        style: stylePath(type, b.style),
      };
    }),
  };
}

const blockDoc = (c: {
  id: string;
  type: string;
  name: string;
  data: Record<string, unknown>;
}): BlockDoc => ({
  id: c.id,
  ...componentState(c),
});

export async function exportDoc(db: Db, kind: Kind | "texts" | "site", id?: string): Promise<Doc> {
  const comps = await listComponents(db);
  const types = new Map(comps.map((c) => [c.id, c.type]));
  if (kind === "page") {
    const p = await getPage(db, id!);
    if (!p || p.deleted) throw new CmsError("errors.noPage");
    return { cms: 1, kind: "webpage", ...(await webPageDoc(db, p, types)) };
  }
  if (kind === "component") {
    const c = await getComponent(db, id!);
    if (!c || c.deleted) throw new CmsError("errors.noBlock");
    return { cms: 1, kind: "component", component: blockDoc(c) };
  }
  if (kind === "template") {
    const t = await getTemplate(db, id!);
    if (!t || t.deleted) throw new CmsError("errors.noTemplate", { id: id ?? "" });
    return { cms: 1, kind: "template", template: { id: t.id, type: t.type, name: t.name, markup: t.markup } };
  }
  if (kind === "layout") {
    const l = await getLayout(db, id!);
    if (!l || l.deleted) throw new CmsError("errors.noLayout", { id: id ?? "" });
    return { cms: 1, kind: "layout", layout: { id: l.id, name: l.name, markup: l.markup } };
  }
  if (kind === "global") {
    const g = await getGlobal(db, id!);
    if (!g) throw new CmsError("errors.noGlobal", { key: id ?? "" });
    return { cms: 1, kind: "global", key: g.key, data: g.data };
  }
  const all = await listTexts(db);
  // One bundle's texts, or every one.
  const texts = Object.fromEntries(
    all.filter((t) => kind !== "bundle" || bundleOf(t.key) === id).map((t) => [t.key, t.value]),
  );
  if (kind === "texts" || kind === "bundle") return { cms: 1, kind: "texts", texts };
  const webpages: WebPageDoc[] = [];
  for (const p of await listPages(db)) if (!p.deleted) webpages.push(await webPageDoc(db, p, types));
  return {
    cms: 1,
    kind: "site",
    webpages,
    components: comps.filter((c) => !c.deleted).map(blockDoc),
    templates: (await listTemplates(db))
      .filter((t) => !t.deleted)
      .map((t) => ({ id: t.id, type: t.type, name: t.name, markup: t.markup })),
    layouts: (await listLayouts(db))
      .filter((l) => !l.deleted)
      .map((l) => ({ id: l.id, name: l.name, markup: l.markup })),
    globals: Object.fromEntries((await listGlobals(db)).map((g) => [g.key, g.data])),
    texts,
  };
}

// ---- XML ---------------------------------------------------------------------------------------------------

const A = "@_";
const isLocale = (k: string) => (LOCALES as readonly string[]).includes(k);
const WEBPAGE_NS = "https://www.cameyware.com/cms/webpage";

/** A value as XML: a text in languages as one element per language, a list as <item>s, an object as its fields. */
function toXmlValue(v: unknown): unknown {
  if (Array.isArray(v)) return { item: v.map(toXmlValue) };
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, w]) => [k, toXmlValue(w)]));
  if (v === undefined || v === null) return "";
  return String(v);
}

function fromXmlValue(n: unknown): unknown {
  if (n === undefined || n === null) return "";
  if (typeof n !== "object") return String(n);
  const o = n as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => !k.startsWith(A));
  if (keys.length === 1 && keys[0] === "#text") return String(o["#text"]);
  if (keys.length === 0) return "";
  if (keys.length === 1 && keys[0] === "item") return (o.item as unknown[]).map(fromXmlValue);
  if (keys.every(isLocale)) return Object.fromEntries(keys.map((k) => [k, String(fromXmlValue(o[k]))]));
  return Object.fromEntries(keys.filter((k) => k !== "#text").map((k) => [k, fromXmlValue(o[k])]));
}

const str = (n: unknown) => String(fromXmlValue(n) ?? "");

const attrs = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [`${A}${k}`, String(v)]),
  );

function blockXml(b: BlockDoc) {
  return {
    ...attrs({ id: b.id, type: b.type, name: b.name, template: b.template }),
    ...(toXmlValue(b.data) as object),
  };
}

const templateXml = (t: TemplateDoc) => ({
  ...attrs({ id: t.id, type: t.type, name: t.name }),
  markup: t.markup,
});
const layoutXml = (l: LayoutDoc) => ({ ...attrs({ id: l.id, name: l.name }), markup: l.markup });

/** A page as Bell's WebPage: its MetaData, its Components. */
function webPageXml(w: WebPageDoc) {
  const meta: Record<string, unknown> = {
    PageID: w.page.id,
    Path: w.page.path,
    Status: w.page.status,
    PageLayout: w.page.layout,
  };
  for (const l of LOCALES) meta[`Title_${l}`] = w.page.title?.[l] ?? "";
  for (const l of LOCALES) meta[`Description_${l}`] = w.page.description?.[l] ?? "";
  if (w.page.breadcrumb === true || w.page.breadcrumb === false)
    meta.IsShowBreadcrumb = String(w.page.breadcrumb);
  meta.IsIncludeInSitemap = String(w.page.sitemap !== false);
  return {
    MetaData: meta,
    Components: {
      Component: w.components.map((c) => ({
        ZoneId: c.zone,
        ZoneIndex: String(c.index ?? 0),
        RowId: c.row,
        ComponentFilePath: c.component,
        StyleFilePath: c.style,
      })),
    },
  };
}

function pageXml(p: PageDoc) {
  const { id, path, status, width, spacing, title, description } = p.page;
  return {
    ...attrs({ id, path, status, width, spacing }),
    title: toXmlValue(title ?? {}),
    description: toXmlValue(description ?? {}),
    block: p.blocks.map(blockXml),
  };
}

const textsXml = (texts: Record<string, L10n>) => ({
  text: Object.entries(texts).map(([key, v]) => ({ ...attrs({ key }), ...(toXmlValue(v) as object) })),
});

const builder = () =>
  new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: A, format: true, suppressEmptyNode: true });

export function toXml(doc: Doc): string {
  const head = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  if (doc.kind === "webpage")
    return head + builder().build({ WebPage: { [`${A}xmlns`]: WEBPAGE_NS, ...webPageXml(doc) } });
  const root: Record<string, unknown> = attrs({ version: 1, kind: doc.kind });
  if (doc.kind === "page") root.page = pageXml(doc);
  else if (doc.kind === "component") root.block = blockXml(doc.component);
  else if (doc.kind === "template") root.template = templateXml(doc.template);
  else if (doc.kind === "layout") root.layout = layoutXml(doc.layout);
  else if (doc.kind === "global")
    root.global = { ...attrs({ key: doc.key }), ...(toXmlValue(doc.data) as object) };
  else if (doc.kind === "texts") root.texts = textsXml(doc.texts);
  else {
    root.WebPage = (doc.webpages ?? []).map(webPageXml);
    root.block = (doc.components ?? []).map(blockXml);
    root.page = (doc.pages ?? []).map(pageXml);
    root.template = (doc.templates ?? []).map(templateXml);
    root.layout = (doc.layouts ?? []).map(layoutXml);
    root.global = Object.entries(doc.globals).map(([key, data]) => ({
      ...attrs({ key }),
      ...(toXmlValue(data) as object),
    }));
    root.texts = textsXml(doc.texts);
  }
  return head + builder().build({ cms: root });
}

const many = (v: unknown) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);

function blockFromXml(n: Record<string, unknown>): BlockDoc {
  const data = fromXmlValue(
    Object.fromEntries(Object.entries(n).filter(([k]) => !k.startsWith(A))),
  ) as Record<string, unknown>;
  return {
    id: n[`${A}id`] as string | undefined,
    type: String(n[`${A}type`] ?? ""),
    name: n[`${A}name`] as string | undefined,
    template: n[`${A}template`] as string | undefined,
    data: data && typeof data === "object" ? data : {},
  };
}

const templateFromXml = (n: Record<string, unknown>): TemplateDoc => ({
  id: n[`${A}id`] as string | undefined,
  type: String(n[`${A}type`] ?? ""),
  name: String(n[`${A}name`] ?? ""),
  markup: str(n.markup),
});

const layoutFromXml = (n: Record<string, unknown>): LayoutDoc => ({
  id: n[`${A}id`] as string | undefined,
  name: String(n[`${A}name`] ?? ""),
  markup: str(n.markup),
});

function webPageFromXml(n: Record<string, unknown>): WebPageDoc {
  const m = (n.MetaData ?? {}) as Record<string, unknown>;
  const words = (prefix: string) =>
    Object.fromEntries(
      LOCALES.flatMap((l) => (str(m[`${prefix}_${l}`]) ? [[l, str(m[`${prefix}_${l}`])]] : [])),
    ) as L10n;
  const flag = (k: string) => (m[k] === undefined ? undefined : str(m[k]) === "true");
  return {
    page: {
      id: str(m.PageID) || undefined,
      path: str(m.Path),
      status: (str(m.Status) || undefined) as PageMeta["status"],
      layout: str(m.PageLayout) || undefined,
      title: words("Title"),
      description: words("Description"),
      breadcrumb: flag("IsShowBreadcrumb") ?? null,
      sitemap: flag("IsIncludeInSitemap") ?? true,
    },
    components: many((n.Components as Record<string, unknown> | undefined)?.Component).map((c) => {
      const o = c as Record<string, unknown>;
      return {
        zone: str(o.ZoneId),
        index: Number(str(o.ZoneIndex)) || 0,
        row: str(o.RowId) || undefined,
        component: str(o.ComponentFilePath),
        style: str(o.StyleFilePath) || undefined,
      };
    }),
  };
}

function pageFromXml(n: Record<string, unknown>): PageDoc {
  return {
    page: {
      id: n[`${A}id`] as string | undefined,
      path: String(n[`${A}path`] ?? ""),
      status: n[`${A}status`] as "active" | "inactive" | undefined,
      width: n[`${A}width`] as string | undefined,
      spacing: n[`${A}spacing`] as string | undefined,
      title: (fromXmlValue(n.title) || {}) as L10n,
      description: (fromXmlValue(n.description) || {}) as L10n,
    },
    blocks: many(n.block).map((b) => blockFromXml(b as Record<string, unknown>)),
  };
}

const textsFromXml = (n: unknown): Record<string, L10n> =>
  Object.fromEntries(
    many((n as Record<string, unknown> | undefined)?.text).map((t) => {
      const o = t as Record<string, unknown>;
      const v = fromXmlValue(Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith(A))));
      return [String(o[`${A}key`]), (typeof v === "object" ? v : {}) as L10n];
    }),
  );

/** The lists, by their place in the document (never by their names alone: a field may be called text or page too). */
const LISTS = [
  "cms.page",
  "cms.page.block",
  "cms.block",
  "cms.template",
  "cms.layout",
  "cms.global",
  "cms.texts.text",
  "cms.WebPage",
  "cms.WebPage.Components.Component",
  "WebPage.Components.Component",
];

export function fromXml(xml: string): Doc {
  // No document type, so no entity of its own (a billion laughs) and nothing from outside.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CmsError("errors.xmlDoctype");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: A,
    parseTagValue: false,
    parseAttributeValue: false,
    isArray: (name, jpath) => name === "item" || LISTS.includes(String(jpath)),
  });
  let tree: Record<string, unknown>;
  try {
    tree = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    throw new CmsError("errors.xmlUnreadable", undefined, [e instanceof Error ? e.message : String(e)]);
  }
  if (tree.WebPage)
    return { cms: 1, kind: "webpage", ...webPageFromXml(tree.WebPage as Record<string, unknown>) };
  const root = tree.cms as Record<string, unknown> | undefined;
  if (!root) throw new CmsError("errors.xmlRoot", { tag: "<WebPage>, <cms>" });
  const kind = root[`${A}kind`];
  const first = (v: unknown, tag: string) => {
    const n = many(v)[0] as Record<string, unknown> | undefined;
    if (!n) throw new CmsError("errors.xmlMissing", { tag });
    return n;
  };
  if (kind === "page") return { cms: 1, kind: "page", ...pageFromXml(first(root.page, "<page>")) };
  if (kind === "component")
    return { cms: 1, kind: "component", component: blockFromXml(first(root.block, "<block>")) };
  if (kind === "template")
    return { cms: 1, kind: "template", template: templateFromXml(first(root.template, "<template>")) };
  if (kind === "layout")
    return { cms: 1, kind: "layout", layout: layoutFromXml(first(root.layout, "<layout>")) };
  const globalOf = (g: Record<string, unknown>) =>
    [
      String(g[`${A}key`]),
      fromXmlValue(Object.fromEntries(Object.entries(g).filter(([k]) => !k.startsWith(A)))) as Record<
        string,
        unknown
      >,
    ] as const;
  if (kind === "global") {
    const [key, data] = globalOf(first(root.global, "<global>"));
    return { cms: 1, kind: "global", key, data };
  }
  if (kind === "texts") return { cms: 1, kind: "texts", texts: textsFromXml(root.texts) };
  if (kind === "site")
    return {
      cms: 1,
      kind: "site",
      webpages: many(root.WebPage).map((w) => webPageFromXml(w as Record<string, unknown>)),
      components: many(root.block).map((b) => blockFromXml(b as Record<string, unknown>)),
      pages: many(root.page).map((p) => pageFromXml(p as Record<string, unknown>)),
      templates: many(root.template).map((t) => templateFromXml(t as Record<string, unknown>)),
      layouts: many(root.layout).map((l) => layoutFromXml(l as Record<string, unknown>)),
      globals: Object.fromEntries(many(root.global).map((g) => globalOf(g as Record<string, unknown>))),
      texts: textsFromXml(root.texts),
    };
  throw new CmsError("errors.xmlKind", { kind: String(kind) });
}

/** An upload's text as a document: JSON or XML, by its first character. */
export function parseUpload(text: string): Doc {
  const t = text.trim();
  if (t.length > 8_000_000) throw new CmsError("errors.tooBig");
  if (t.startsWith("<")) return fromXml(t);
  let doc: unknown;
  try {
    doc = JSON.parse(t);
  } catch (e) {
    throw new CmsError("errors.jsonUnreadable", undefined, [e instanceof Error ? e.message : String(e)]);
  }
  const d = doc as { cms?: unknown; kind?: unknown };
  if (d?.cms !== 1 || typeof d.kind !== "string") throw new CmsError("errors.notCmsFile");
  return doc as Doc;
}

// ---- upload ------------------------------------------------------------------------------------------------

export type PlanItem = {
  kind: Kind;
  id: string;
  label: Both;
  action: "create" | "update" | "unchanged";
  /** Nobody's now: taken for you when the upload is applied. */
  take?: boolean;
};
export type Plan = { items: PlanItem[]; notes: Detail[] };

const same = (s: string): Both => ({ zh: s, en: s });

/**
 * What [doc] would change ([apply] false), or the change made (true), in one transaction: refused whole, with every
 * problem, when any part of it doesn't pass the catalog's check or changes a file that isn't [by]'s to change.
 */
export async function importDoc(db: PGlite, doc: Doc, by: string, apply: boolean): Promise<Plan> {
  const items: PlanItem[] = [];
  const notes: Detail[] = [];
  const errors: Detail[] = [];
  const writes: ((tx: Db) => Promise<void>)[] = [];
  const states = await fileStates(db);
  const toTake: Item[] = [];
  const at = (where: Detail, problem: Detail) => msg("check.at", { at: where, problem });

  /** May [by] change this file? Nobody's is taken for them; another's or a locked one is a problem. */
  const mayChange = (kind: Kind, id: string, label: Both) => {
    const f = states.get(`${kind}:${id}`);
    if (!f || f.status === "available") {
      toTake.push({ kind, id });
      return true;
    }
    if (f.status === "in_workflow") errors.push(msg("errors.importLocked", { label }));
    else if (f.owner !== by) errors.push(msg("errors.importOthers", { label, owner: f.owner ?? "" }));
    return false;
  };

  /** What there will be, by id: the CMS's (not deleted), and what this upload makes. */
  const templates = new Map(
    (await listTemplates(db)).filter((t) => !t.deleted).map((t) => [t.id, t.type] as const),
  );
  const layouts = new Set((await listLayouts(db)).filter((l) => !l.deleted).map((l) => l.id));
  const components = new Map(
    (await listComponents(db)).filter((c) => !c.deleted).map((c) => [c.id, c.type] as const),
  );

  const template = async (t: TemplateDoc) => {
    const where = msg("check.atTemplate", { name: t.name || t.id || "" });
    if (!TYPES[t.type]) return void errors.push(at(where, msg("errors.noType", { type: t.type })));
    errors.push(...(await templateProblems(db, t.type, t.markup ?? "")).map((e) => at(where, e)));
    const existing = t.id ? await getTemplate(db, t.id) : undefined;
    if (existing && !existing.deleted && existing.type === t.type) {
      const unchanged = existing.name === t.name && existing.markup === t.markup;
      const label = same(t.name || existing.id);
      const take = !unchanged && mayChange("template", existing.id, label);
      items.push({
        kind: "template",
        id: existing.id,
        label,
        action: unchanged ? "unchanged" : "update",
        take,
      });
      if (!unchanged)
        writes.push((tx) => saveTemplate(tx, existing.id, { name: t.name, markup: t.markup }, by));
      return;
    }
    const id = existing ? newId("tpl") : (t.id ?? newId("tpl"));
    if (existing) notes.push(msg("notes.templateCopied", { from: t.id ?? "", to: id }));
    items.push({ kind: "template", id, label: same(t.name || id), action: "create" });
    templates.set(id, t.type);
    writes.push((tx) => createTemplate(tx, t.type, t.name, t.markup, by, id).then(() => undefined));
  };

  const layout = async (l: LayoutDoc) => {
    const where = msg("check.atLayout", { name: l.name || l.id || "" });
    errors.push(...(await layoutProblems(db, l.markup ?? "")).map((e) => at(where, e)));
    const existing = l.id && !isBuiltinLayout(l.id) ? await getLayout(db, l.id) : undefined;
    if (existing && !existing.deleted) {
      const unchanged = existing.name === l.name && existing.markup === l.markup;
      const label = same(l.name || existing.id);
      const take = !unchanged && mayChange("layout", existing.id, label);
      items.push({
        kind: "layout",
        id: existing.id,
        label,
        action: unchanged ? "unchanged" : "update",
        take,
      });
      if (!unchanged)
        writes.push((tx) => saveLayout(tx, existing.id, { name: l.name, markup: l.markup }, by));
      return;
    }
    const id = existing || !l.id || isBuiltinLayout(l.id) ? newId("lay") : l.id;
    if (existing) notes.push(msg("notes.layoutCopied", { from: l.id ?? "", to: id }));
    items.push({ kind: "layout", id, label: same(l.name || id), action: "create" });
    layouts.add(id);
    writes.push((tx) => createLayout(tx, l.name, l.markup, by, id).then(() => undefined));
  };

  const block = async (b: BlockDoc, copy: boolean, where: Detail): Promise<string> => {
    const checked = checkBlock(b.type, b.data);
    errors.push(...checked.errors.map((e) => at(where, e)));
    const existing = b.id ? await getComponent(db, b.id) : undefined;
    if (existing && !existing.deleted && !copy) {
      if (existing.type !== b.type)
        errors.push(
          at(where, msg("errors.importTypeChange", { id: existing.id, from: existing.type, to: b.type })),
        );
      // Both as the check leaves them (a field left out is its default), so what is the same reads the same.
      const unchanged =
        canonical(checkBlock(existing.type, existing.data).value) === canonical(checked.value) &&
        existing.name === (b.name ?? existing.name);
      const label = same(b.name || existing.id);
      const take = !unchanged && mayChange("component", existing.id, label);
      items.push({
        kind: "component",
        id: existing.id,
        label,
        action: unchanged ? "unchanged" : "update",
        take,
      });
      if (!unchanged)
        writes.push((tx) => saveComponent(tx, existing.id, { name: b.name, data: checked.value }, by));
      return existing.id;
    }
    const id = existing ? newId(b.type) : (b.id ?? newId(b.type));
    if (existing) notes.push(msg("notes.blockCopied", { from: b.id ?? "", to: id }));
    items.push({ kind: "component", id, label: same(b.name || id), action: "create" });
    components.set(id, b.type);
    writes.push((tx) =>
      createComponent(tx, b.type, b.name ?? "", by, checked.value, id).then(() => undefined),
    );
    return id;
  };

  /**
   * A page's settings and placements into the working copy: a new page at an address no page has (inactive), else the
   * page at it (by its id, or else its address) changed when it differs.
   */
  const putPage = async (meta: PageMeta, placements: Placement[], layoutName: string, where: Detail) => {
    if (!isPagePath(meta.path)) errors.push(at(where, msg("check.pagePath", { path: meta.path })));
    if (!isBuiltinLayout(layoutName) && !layouts.has(layoutName))
      errors.push(at(where, msg("check.noLayout", { id: layoutName })));
    const byId = meta.id ? await getPage(db, meta.id) : undefined;
    const byPath = (await listPages(db)).find((x) => x.path === meta.path && !x.deleted);
    const target = byId && !byId.deleted ? byId : undefined;
    if (!target && byPath) errors.push(at(where, msg("errors.importPathTaken", { id: byPath.id })));
    const settings = {
      path: meta.path,
      status: meta.status ?? "inactive",
      title: meta.title ?? {},
      description: meta.description ?? {},
      layout: layoutName,
      breadcrumb: meta.breadcrumb ?? null,
      sitemap: meta.sitemap !== false,
      blocks: placements,
    };
    if (!target) {
      const id = meta.id && !byId ? meta.id : newId("page");
      if (meta.id && byId) notes.push(msg("notes.pageIdUsed", { from: meta.id, to: id }));
      notes.push(msg("notes.newPageInactive", { path: meta.path }));
      items.push({ kind: "page", id, label: same(meta.path), action: "create" });
      writes.push(async (tx) => {
        await createPage(tx, { path: settings.path, title: settings.title }, by, id);
        await savePage(tx, id, { ...settings, status: "inactive" }, by);
      });
      return;
    }
    const unchanged = canonical(pageState(target)) === canonical(pageState(settings));
    const label = same(meta.path);
    const take = !unchanged && mayChange("page", target.id, label);
    items.push({ kind: "page", id: target.id, label, action: unchanged ? "unchanged" : "update", take });
    if (!unchanged) writes.push((tx) => savePage(tx, target.id, settings, by));
  };

  /** A page as Bell's WebPage: its components by their files' paths, each in its zone, ordered by its index there. */
  const webpage = async (w: WebPageDoc) => {
    const where = msg("check.atPage", { path: w.page.path });
    const layoutName = w.page.layout ? fileOf(w.page.layout) : layoutOf(w.page);
    const zoneOrder: string[] = [];
    for (const c of w.components) if (!zoneOrder.includes(c.zone)) zoneOrder.push(c.zone);
    const sorted = [...w.components].sort(
      (a, b) => zoneOrder.indexOf(a.zone) - zoneOrder.indexOf(b.zone) || (a.index ?? 0) - (b.index ?? 0),
    );
    const placements: Placement[] = [];
    for (const c of sorted) {
      const id = fileOf(c.component);
      const type = components.get(id);
      if (!type) errors.push(at(where, msg("errors.importNoComponent", { path: c.component })));
      const style = fileOf(c.style);
      const own = style && style !== "builtin" ? style : undefined;
      if (own && (!templates.has(own) || (type && templates.get(own) !== type)))
        errors.push(at(where, msg("check.noTemplate", { id: own })));
      if (!/^[a-z][a-z0-9_-]{0,31}$/.test(c.zone))
        errors.push(at(where, msg("check.badZone", { zone: c.zone })));
      if (c.row !== undefined && !isRowKey(c.row))
        errors.push(at(where, msg("check.badRow", { row: c.row })));
      placements.push(placement({ id, zone: c.zone, row: c.row, style: own }));
    }
    await putPage(w.page, placements, layoutName, where);
  };

  /** A page file of before S4: its blocks inside it, each in the zone its type takes in the page's layout. */
  const page = async (p: PageDoc) => {
    const where = msg("check.atPage", { path: p.page.path });
    const layoutName = layoutOf(p.page);
    const zones = zonesOf(layoutName);
    const known = p.page.id ? await getPage(db, p.page.id) : undefined;
    const fresh = !known || known.deleted;
    const placements: Placement[] = [];
    for (const [i, b] of p.blocks.entries()) {
      const id = await block(
        b,
        fresh && !!b.id && !!(await getComponent(db, b.id)),
        msg("check.atPageBlock", { path: p.page.path, n: i + 1 }),
      );
      const own = b.template && templates.get(b.template) === b.type ? b.template : undefined;
      placements.push(
        placement({ id, zone: defaultZone(zones.names, !!TYPES[b.type]?.full, zones.full), style: own }),
      );
    }
    await putPage(p.page, placements, layoutName, where);
  };

  const global = async (key: string, data: Record<string, unknown>) => {
    const def = GLOBALS[key];
    if (!def) return void errors.push(msg("errors.noGlobal", { key }));
    const label = both(def, key);
    const checked = check(data, def.fields);
    errors.push(...checked.errors.map((e) => at(msg("check.name", { label }), e)));
    const now = await getGlobal(db, key);
    const unchanged = !!now && canonical(check(now.data, def.fields).value) === canonical(checked.value);
    const take = !!now && !unchanged && mayChange("global", key, label);
    items.push({
      kind: "global",
      id: key,
      label,
      action: !now ? "create" : unchanged ? "unchanged" : "update",
      take,
    });
    if (!unchanged) writes.push((tx) => saveGlobal(tx, key, checked.value, by));
  };

  /** The texts by their bundle: a bundle new, changed or the same; one that changes must be yours or nobody's. */
  const texts = async (all: Record<string, L10n>) => {
    const now = new Map((await listTexts(db)).map((t) => [t.key, t.value]));
    const bundles = new Map<string, { create: boolean; changed: boolean }>();
    for (const [key, value] of Object.entries(all)) {
      if (!isL10n(value) && Object.keys(value ?? {}).length) {
        errors.push(msg("errors.importTextShape", { key }));
        continue;
      }
      const ns = bundleOf(key);
      const b = bundles.get(ns) ?? { create: !states.has(`bundle:${ns}`), changed: false };
      bundles.set(ns, b);
      const merged = { ...(now.get(key) ?? {}), ...value };
      if (now.has(key) && canonical(now.get(key)) === canonical(merged)) continue;
      b.changed = true;
      writes.push((tx) => saveText(tx, key, merged, by));
    }
    for (const [ns, b] of bundles) {
      const label = bundleLabel(ns);
      const take = !b.create && b.changed && mayChange("bundle", ns, label);
      items.push({
        kind: "bundle",
        id: ns,
        label,
        action: b.create ? "create" : b.changed ? "update" : "unchanged",
        take,
      });
    }
  };

  if (doc.kind === "webpage") await webpage(doc);
  else if (doc.kind === "page") await page(doc);
  else if (doc.kind === "component") await block(doc.component, false, msg("check.atBlock"));
  else if (doc.kind === "template") await template(doc.template);
  else if (doc.kind === "layout") await layout(doc.layout);
  else if (doc.kind === "global") await global(doc.key, doc.data);
  else if (doc.kind === "texts") await texts(doc.texts ?? {});
  else if (doc.kind === "site") {
    for (const t of doc.templates ?? []) await template(t);
    for (const l of doc.layouts ?? []) await layout(l);
    for (const b of doc.components ?? []) await block(b, false, msg("check.atBlock"));
    for (const w of doc.webpages ?? []) await webpage(w);
    for (const p of doc.pages ?? []) await page(p);
    for (const [k, v] of Object.entries(doc.globals ?? {})) await global(k, v);
    await texts(doc.texts ?? {});
  } else errors.push(msg("errors.importUnknown"));

  if (errors.length) throw new CmsError("errors.importRefused", undefined, errors);
  if (apply)
    await db.transaction(async (tx) => {
      if (toTake.length) await take(tx, toTake, by);
      for (const w of writes) await w(tx);
    });
  return { items, notes };
}
