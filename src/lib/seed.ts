/**
 * The CMS's first content, and the texts the website's code adds later. The first start (an empty database) takes the
 * website's snapshot (content/site.json: pages, blocks, globals) and every UI text of its messages in the four languages,
 * checks them all in as one, and makes it release 1, shown on preview and production (it is what they show). Every
 * start after that adds the message keys the code has and the CMS hasn't (a new text in code), checked in as they are.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { Db } from "./db";
import { siteRepo } from "./paths";
import { canonical, listTexts } from "./store";
import { checkIn, createRelease, markDeployed } from "./workflow";
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

/** The snapshot's pages, blocks and globals into the working copy (by their ids, as the website had them). */
export async function importSnapshot(db: Db, content: SiteContent, by: string) {
  for (const p of content.pages) {
    for (const b of p.blocks)
      await db.query(
        `insert into components (id, type, name, data, updated_by) values ($1, $2, $3, $4, $5) on conflict (id) do nothing`,
        [b.id, b.type, b.name ?? "", JSON.stringify(b.data), by],
      );
    await db.query(
      `insert into pages (id, path, status, title, description, width, spacing, blocks, updated_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        p.id,
        p.path,
        p.status,
        JSON.stringify(p.title),
        JSON.stringify(p.description),
        p.width ?? "normal",
        p.spacing ?? "compact",
        JSON.stringify(p.blocks.map((b) => b.id)),
        by,
      ],
    );
  }
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
    ...GLOBAL_KEYS.map((k) => ({ kind: "global" as const, id: k })),
    ...Object.keys(texts).map((k) => ({ kind: "text" as const, id: k })),
  ];
  await checkIn(db, items, "初始内容：从官网的 content/site.json 和 messages 导入", SYSTEM);
  const release = await createRelease(db, SYSTEM, "官网当时的内容");
  await markDeployed(db, "preview", release, SYSTEM);
  await markDeployed(db, "production", release, SYSTEM);
  return true;
}

/** Texts the code added since (a new message key): into the CMS, checked in as the code has them. */
export async function addCodeTexts(db: PGlite, repo = siteRepo()): Promise<string[]> {
  const have = new Map((await listTexts(db)).map((t) => [t.key, t.value]));
  const added: string[] = [];
  for (const [key, value] of Object.entries(codeTexts(repo))) {
    if (have.has(key)) {
      // A language the CMS lacks for a text it has: the code's (a language added since).
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
  }
  if (added.length)
    await checkIn(
      db,
      added.map((id) => ({ kind: "text" as const, id })),
      "代码里新增的界面文字",
      SYSTEM,
    );
  return added;
}
