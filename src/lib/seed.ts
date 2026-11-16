/**
 * The CMS's first content, and the texts the website's code adds later. The first start (an empty database) takes the
 * website's snapshot (content/site.json: pages, blocks, globals) and every UI text of its messages in the four languages,
 * checks them all in as one, and makes it release 1, shown on preview and production (it is what they show). Every
 * start after that adds the message keys the code has and the CMS hasn't (a new text in code), checked in as they are,
 * and the built-in templates' code as the website's main has it (addCodeFiles, S6).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { bundleOf } from "./bundles";
import { TYPES } from "./catalog";
import { knownTexts, standing } from "./code";
import type { Db } from "./db";
import { fileStates } from "./files";
import { gitTexts } from "./git";
import { placement, upgradePage } from "./pages";
import { siteRepo } from "./paths";
import { createRelease } from "./releases";
import { canonical, listTexts, revisionsAt, workingStates, writeWorking } from "./store";
import { publishDirect, recordSeed } from "./workflow";
import { codePath } from "@/generated/code";
import { GLOBAL_KEYS, type L10n, LOCALES, type SiteContent } from "@/generated/model";

const json = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;

/** Nested messages as flat keys ("nav.signIn"). */
function flatten(o: Record<string, unknown>, at = "", out: Record<string, string> = {}) {
  for (const [k, v] of Object.entries(o)) {
    if (v && typeof v === "object") flatten(v as Record<string, unknown>, `${at}${k}.`, out);
    else if (typeof v === "string") out[`${at}${k}`] = v;
  }
  return out;
}

/** Every UI text of the website's code, by key, in the four languages (the app's words under "app."). */
export function codeTexts(repo = siteRepo()): Record<string, L10n> {
  const m = (f: string) => join(repo, "messages", f);
  const APP = {
    zh: m("generated/app.zh.json"),
    "zh-hant": m("generated/app.zh-hant.json"),
    en: m("app.en.json"),
    fr: m("app.fr.json"),
  };
  const out: Record<string, L10n> = {};
  for (const l of LOCALES) {
    const own = flatten(json(m(`${l}.json`)));
    const app = existsSync(/*turbopackIgnore: true*/ APP[l]) ? flatten(json(APP[l]), "app.") : {};
    for (const [k, v] of Object.entries({ ...own, ...app })) (out[k] ??= {})[l] = v;
  }
  return out;
}

/**
 * The snapshot's pages, blocks and globals into the working copy (by their ids, as the website had them): a page of a
 * snapshot made before layouts gets one (upgradePage), each block its zone and its style as the snapshot has them.
 */
export async function importSnapshot(db: Db, content: SiteContent, by: string) {
  for (const p of content.pages) {
    for (const b of p.blocks)
      await db.query(
        `insert into components (id, type, name, data, updated_by) values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
        [b.id, b.type, b.name ?? "", JSON.stringify(b.data), by],
      );
    const up = upgradePage(
      { layout: p.layout, spacing: p.spacing, blocks: p.blocks.map((b) => b.id) },
      (id) => p.blocks.find((b) => b.id === id)?.type,
      (id) => p.blocks.find((b) => b.id === id)?.template,
    );
    const blocks = up.blocks.map((pl, i) =>
      placement({ ...pl, zone: p.blocks[i]?.zone ?? pl.zone, row: p.blocks[i]?.row }),
    );
    await db.query(
      `insert into pages (id, path, status, title, description, layout, breadcrumb, sitemap, blocks, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        p.id,
        p.path,
        p.status,
        JSON.stringify(p.title),
        JSON.stringify(p.description),
        up.layout,
        p.breadcrumb ?? null,
        p.sitemap !== false,
        JSON.stringify(blocks),
        by,
      ],
    );
  }
  for (const [id, t] of Object.entries(content.templates ?? {}))
    await db.query(`insert into templates (id, type, name, markup, updated_by) values ($1, $2, $3, $4, $5)`, [
      id,
      t.type,
      t.name,
      t.markup,
      by,
    ]);
  for (const [id, l] of Object.entries(content.layouts ?? {}))
    await db.query(`insert into layouts (id, name, markup, updated_by) values ($1, $2, $3, $4)`, [
      id,
      l.name,
      l.markup,
      by,
    ]);
  for (const k of GLOBAL_KEYS)
    await db.query(`insert into globals (key, data, updated_by) values ($1, $2, $3)`, [
      k,
      JSON.stringify(content.globals[k]),
      by,
    ]);
}

const SYSTEM = "system";

/** On an empty database, the website as it is, as release 1 everywhere; nothing when there is content already. */
export async function seedIfEmpty(db: PGlite, repo = siteRepo()): Promise<boolean> {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from pages`);
  if (rows[0]!.n > 0) return false;
  const content = json(join(repo, "content", "site.json")) as unknown as SiteContent;
  await importSnapshot(db, content, SYSTEM);
  const texts = { ...codeTexts(repo), ...content.texts };
  for (const [key, value] of Object.entries(texts))
    await db.query(`insert into texts (key, value, updated_by) values ($1, $2, $3)`, [
      key,
      JSON.stringify(value),
      SYSTEM,
    ]);
  const items = [
    ...content.pages.flatMap((p) => [
      { kind: "page" as const, id: p.id },
      ...p.blocks.map((b) => ({ kind: "component" as const, id: b.id })),
    ]),
    ...Object.keys(content.templates ?? {}).map((id) => ({ kind: "template" as const, id })),
    ...Object.keys(content.layouts ?? {}).map((id) => ({ kind: "layout" as const, id })),
    ...GLOBAL_KEYS.map((k) => ({ kind: "global" as const, id: k })),
    ...[...new Set(Object.keys(texts).map(bundleOf))].map((id) => ({ kind: "bundle" as const, id })),
  ];
  await publishDirect(db, items, "初始内容：从官网的 content/site.json 和 messages 导入", SYSTEM);
  const release = await createRelease(db, SYSTEM, "官网当时的内容", () => false);
  await recordSeed(db, release, SYSTEM);
  return true;
}

/**
 * Texts the code added since (a new message key): into the CMS as the code has them, their bundle's production version
 * at once (the website already shows them from its code). A language the CMS lacks for a text: the code's too. Only in
 * a bundle nobody holds, as production has it (or a bundle that doesn't exist yet): an editor's draft is never published
 * this way; a bundle someone holds gets them at a start after it is free (the website shows the code's words till then).
 */
export async function addCodeTexts(db: PGlite, repo = siteRepo()): Promise<string[]> {
  const have = new Map((await listTexts(db)).map((t) => [t.key, t.value]));
  const states = await fileStates(db);
  const prod = await revisionsAt(db, () => false);
  const work = await workingStates(db);
  const free = (ns: string) => {
    const f = states.get(`bundle:${ns}`);
    if (!f) return !work.has(`bundle:${ns}`);
    return (
      f.status === "available" &&
      canonical(prod.get(`bundle:${ns}`)?.data) === canonical(work.get(`bundle:${ns}`)?.state)
    );
  };
  const added: string[] = [];
  const bundles = new Set<string>();
  for (const [key, value] of Object.entries(codeTexts(repo))) {
    if (!free(bundleOf(key))) continue;
    if (have.has(key)) {
      const now = have.get(key)!;
      const merged = { ...value, ...now };
      if (canonical(merged) === canonical(now)) continue;
      await db.query(`update texts set value = $2, updated_at = now(), updated_by = $3 where key = $1`, [
        key,
        JSON.stringify(merged),
        SYSTEM,
      ]);
    } else
      await db.query(`insert into texts (key, value, updated_by) values ($1, $2, $3)`, [
        key,
        JSON.stringify(value),
        SYSTEM,
      ]);
    added.push(key);
    bundles.add(bundleOf(key));
  }
  if (bundles.size)
    await publishDirect(
      db,
      [...bundles].map((id) => ({ kind: "bundle" as const, id })),
      "代码里新增的界面文字",
      SYSTEM,
    );
  return added;
}

/**
 * The built-in templates' code as the website's main has it (S6, code.ts): a type's file the CMS lacks, and a change the
 * code made to one nobody holds as production has it, in as production's version at once. A text the CMS had before is
 * main behind the CMS, left as it is; a file someone holds takes the code's change at a later start (its workflow refuses
 * to go on meanwhile). Nothing when the website's main has no such files (before its v2.4.0).
 */
export async function addCodeFiles(db: PGlite, repo = siteRepo()): Promise<string[]> {
  const ids = Object.keys(TYPES);
  const main = await gitTexts("main", ids.map(codePath), repo).catch(() => new Map<string, undefined>());
  const [states, prod, work, known] = await Promise.all([
    fileStates(db),
    revisionsAt(db, () => false),
    workingStates(db),
    knownTexts(db),
  ]);
  const taken = ids.filter((id) => {
    const text = main.get(codePath(id));
    const key = `code:${id}`;
    const f = states.get(key);
    const p = prod.get(key);
    if (
      text === undefined ||
      standing(text, (p?.data as { source?: string })?.source, known.get(id)) !== "changed"
    )
      return false;
    return !f || (f.status === "available" && canonical(p?.data) === canonical(work.get(key)?.state));
  });
  for (const id of taken) await writeWorking(db, "code", id, { source: main.get(codePath(id)) }, SYSTEM);
  if (taken.length)
    await publishDirect(
      db,
      taken.map((id) => ({ kind: "code" as const, id })),
      "官网代码里的内置模板",
      SYSTEM,
    );
  return taken;
}
