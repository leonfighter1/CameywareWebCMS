/**
 * Download and upload (the owner, 2026-11-15: 「表可以通过上传相应的JSON 或者XML 去更改数据，也可以下载下来去更改」,
 * 「可以通过download and upload 去上传并且新建一个新的url of page」): a page with its blocks, a block, a global, the UI
 * texts or the whole site, as JSON or XML, both ways. An upload is checked against the catalog like a save and shown as
 * a plan before anything changes; applied, it goes into the working copy (drafts) for a check-in. A page with an
 * address no page has is a new page; a block id already used elsewhere is copied under a new id. Each file it changes
 * must be yours or nobody's (it is taken for you then); one someone else holds or in the workflow refuses the upload.
 */
import type { PGlite } from "@electric-sql/pglite";
import { XMLBuilder, XMLParser } from "fast-xml-parser";
import { both, check, checkBlock, GLOBALS } from "./catalog";
import type { Db } from "./db";
import { fileStates, type Item, take } from "./files";
import {
  canonical,
  componentState,
  createComponent,
  createPage,
  getComponent,
  getGlobal,
  getPage,
  type Kind,
  listGlobals,
  listPages,
  listTexts,
  newId,
  pageState,
  saveComponent,
  saveGlobal,
  savePage,
  saveText,
} from "./store";
import { type Both, CmsError, type Detail, msg } from "./words";
import { isL10n, isPagePath, type L10n, LOCALES } from "@/generated/model";

type BlockDoc = { id?: string; type: string; name?: string; data: Record<string, unknown> };
type PageDoc = {
  page: {
    id?: string;
    path: string;
    status?: "active" | "inactive";
    title: L10n;
    description?: L10n;
    width?: string;
    spacing?: string;
  };
  blocks: BlockDoc[];
};
export type Doc =
  | ({ cms: 1; kind: "page" } & PageDoc)
  | { cms: 1; kind: "component"; component: BlockDoc }
  | { cms: 1; kind: "global"; key: string; data: Record<string, unknown> }
  | { cms: 1; kind: "texts"; texts: Record<string, L10n> }
  | {
      cms: 1;
      kind: "site";
      pages: PageDoc[];
      globals: Record<string, Record<string, unknown>>;
      texts: Record<string, L10n>;
    };

// ---- download ----------------------------------------------------------------------------------------------

async function pageDoc(db: Db, id: string): Promise<PageDoc> {
  const p = await getPage(db, id);
  if (!p || p.deleted) throw new CmsError("errors.noPage");
  const blocks: BlockDoc[] = [];
  for (const b of p.blocks) {
    const c = await getComponent(db, b);
    if (c && !c.deleted) blocks.push({ id: c.id, type: c.type, name: c.name, data: c.data });
  }
  const s = pageState(p);
  return {
    page: {
      id: p.id,
      path: s.path,
      status: s.status,
      title: s.title,
      description: s.description,
      width: s.width,
      spacing: s.spacing,
    },
    blocks,
  };
}

export async function exportDoc(db: Db, kind: Kind | "texts" | "site", id?: string): Promise<Doc> {
  if (kind === "page") return { cms: 1, kind: "page", ...(await pageDoc(db, id!)) };
  if (kind === "component") {
    const c = await getComponent(db, id!);
    if (!c || c.deleted) throw new CmsError("errors.noBlock");
    return { cms: 1, kind: "component", component: { id: c.id, ...componentState(c) } };
  }
  if (kind === "global") {
    const g = await getGlobal(db, id!);
    if (!g) throw new CmsError("errors.noGlobal", { key: id ?? "" });
    return { cms: 1, kind: "global", key: g.key, data: g.data };
  }
  const texts = Object.fromEntries((await listTexts(db)).map((t) => [t.key, t.value]));
  if (kind === "texts" || kind === "text") return { cms: 1, kind: "texts", texts };
  const pages: PageDoc[] = [];
  for (const p of await listPages(db)) if (!p.deleted) pages.push(await pageDoc(db, p.id));
  const globals = Object.fromEntries((await listGlobals(db)).map((g) => [g.key, g.data]));
  return { cms: 1, kind: "site", pages, globals, texts };
}

// ---- XML ---------------------------------------------------------------------------------------------------

const A = "@_";
const isLocale = (k: string) => (LOCALES as readonly string[]).includes(k);

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

const attrs = (o: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(o)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [`${A}${k}`, String(v)]),
  );

function blockXml(b: BlockDoc) {
  return { ...attrs({ id: b.id, type: b.type, name: b.name }), ...(toXmlValue(b.data) as object) };
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

export function toXml(doc: Doc): string {
  const root: Record<string, unknown> = attrs({ version: 1, kind: doc.kind });
  if (doc.kind === "page") root.page = pageXml(doc);
  else if (doc.kind === "component") root.block = blockXml(doc.component);
  else if (doc.kind === "global")
    root.global = { ...attrs({ key: doc.key }), ...(toXmlValue(doc.data) as object) };
  else if (doc.kind === "texts") root.texts = textsXml(doc.texts);
  else {
    root.page = doc.pages.map(pageXml);
    root.global = Object.entries(doc.globals).map(([key, data]) => ({
      ...attrs({ key }),
      ...(toXmlValue(data) as object),
    }));
    root.texts = textsXml(doc.texts);
  }
  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: A,
    format: true,
    suppressEmptyNode: true,
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build({ cms: root })}`;
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
    data: data && typeof data === "object" ? data : {},
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

export function fromXml(xml: string): Doc {
  // No document type, so no entity of its own (a billion laughs) and nothing from outside.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new CmsError("errors.xmlDoctype");
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: A,
    parseTagValue: false,
    parseAttributeValue: false,
    // A list by its place in the document, never by its name alone: a field may be called text or page too.
    isArray: (name, jpath) =>
      name === "item" ||
      ["cms.page", "cms.page.block", "cms.block", "cms.global", "cms.texts.text"].includes(String(jpath)),
  });
  let tree: Record<string, unknown>;
  try {
    tree = parser.parse(xml) as Record<string, unknown>;
  } catch (e) {
    throw new CmsError("errors.xmlUnreadable", undefined, [e instanceof Error ? e.message : String(e)]);
  }
  const root = tree.cms as Record<string, unknown> | undefined;
  if (!root) throw new CmsError("errors.xmlRoot", { tag: "<cms>" });
  const kind = root[`${A}kind`];
  if (kind === "page") {
    const p = many(root.page)[0] as Record<string, unknown> | undefined;
    if (!p) throw new CmsError("errors.xmlMissing", { tag: "<page>" });
    return { cms: 1, kind: "page", ...pageFromXml(p) };
  }
  if (kind === "component") {
    const b = many(root.block)[0] as Record<string, unknown> | undefined;
    if (!b) throw new CmsError("errors.xmlMissing", { tag: "<block>" });
    return { cms: 1, kind: "component", component: blockFromXml(b) };
  }
  const globalOf = (g: Record<string, unknown>) =>
    [
      String(g[`${A}key`]),
      fromXmlValue(Object.fromEntries(Object.entries(g).filter(([k]) => !k.startsWith(A)))) as Record<
        string,
        unknown
      >,
    ] as const;
  if (kind === "global") {
    const g = many(root.global)[0] as Record<string, unknown> | undefined;
    if (!g) throw new CmsError("errors.xmlMissing", { tag: "<global>" });
    const [key, data] = globalOf(g);
    return { cms: 1, kind: "global", key, data };
  }
  if (kind === "texts") return { cms: 1, kind: "texts", texts: textsFromXml(root.texts) };
  if (kind === "site")
    return {
      cms: 1,
      kind: "site",
      pages: many(root.page).map((p) => pageFromXml(p as Record<string, unknown>)),
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
    writes.push((tx) =>
      createComponent(tx, b.type, b.name ?? "", by, checked.value, id).then(() => undefined),
    );
    return id;
  };

  const page = async (p: PageDoc) => {
    const where = msg("check.atPage", { path: p.page.path });
    if (!isPagePath(p.page.path)) errors.push(at(where, msg("check.pagePath", { path: p.page.path })));
    const byId = p.page.id ? await getPage(db, p.page.id) : undefined;
    const byPath = (await listPages(db)).find((x) => x.path === p.page.path && !x.deleted);
    const target = byId && !byId.deleted ? byId : undefined;
    if (!target && byPath) errors.push(at(where, msg("errors.importPathTaken", { id: byPath.id })));
    const fresh = !target;
    const ids: string[] = [];
    for (const [i, b] of p.blocks.entries())
      ids.push(
        await block(
          b,
          fresh && !!b.id && !!(await getComponent(db, b.id)),
          msg("check.atPageBlock", { path: p.page.path, n: i + 1 }),
        ),
      );
    const settings = {
      path: p.page.path,
      status: p.page.status ?? "inactive",
      title: p.page.title ?? {},
      description: p.page.description ?? {},
      width: (p.page.width ?? "normal") as "normal",
      spacing: (p.page.spacing ?? "compact") as "compact",
      blocks: ids,
    };
    if (fresh) {
      const id = p.page.id && !byId ? p.page.id : newId("page");
      if (p.page.id && byId) notes.push(msg("notes.pageIdUsed", { from: p.page.id, to: id }));
      notes.push(msg("notes.newPageInactive", { path: p.page.path }));
      items.push({ kind: "page", id, label: same(p.page.path), action: "create" });
      writes.push(async (tx) => {
        await createPage(tx, { path: settings.path, title: settings.title }, by, id);
        await savePage(tx, id, { ...settings, status: "inactive" }, by);
      });
    } else {
      const unchanged = canonical(pageState(target!)) === canonical(settings);
      const label = same(p.page.path);
      const take = !unchanged && mayChange("page", target!.id, label);
      items.push({ kind: "page", id: target!.id, label, action: unchanged ? "unchanged" : "update", take });
      if (!unchanged) writes.push((tx) => savePage(tx, target!.id, settings, by));
    }
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

  const texts = async (all: Record<string, L10n>) => {
    const now = new Map((await listTexts(db)).map((t) => [t.key, t.value]));
    for (const [key, value] of Object.entries(all)) {
      if (!isL10n(value) && Object.keys(value ?? {}).length) {
        errors.push(msg("errors.importTextShape", { key }));
        continue;
      }
      const merged = { ...(now.get(key) ?? {}), ...value };
      const unchanged = now.has(key) && canonical(now.get(key)) === canonical(merged);
      const take = now.has(key) && !unchanged && mayChange("text", key, same(key));
      items.push({
        kind: "text",
        id: key,
        label: same(key),
        action: !now.has(key) ? "create" : unchanged ? "unchanged" : "update",
        take,
      });
      if (!unchanged) writes.push((tx) => saveText(tx, key, merged, by));
    }
  };

  if (doc.kind === "page") await page(doc);
  else if (doc.kind === "component") await block(doc.component, false, msg("check.atBlock"));
  else if (doc.kind === "global") await global(doc.key, doc.data);
  else if (doc.kind === "texts") await texts(doc.texts ?? {});
  else if (doc.kind === "site") {
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
