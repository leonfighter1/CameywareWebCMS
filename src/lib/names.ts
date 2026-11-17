/**
 * Files' names (S10; the owner, 2026-11-16: 「所有的page name和file都不带中文，只有内容可以是中文」): a page's, a block's,
 * a style's (template's) or a layout's name is English letters, digits, _ and -, starting with a letter or a digit; what
 * the file holds may be in any language. Names made by the CMS (a page's from its title, the files of before renamed)
 * keep letters and digits and make each run of anything else one _.
 */
import type { Db } from "./db";
import { CmsError } from "./words";

const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/;

export const isFileName = (s: string) => FILE_NAME.test(s);

/** [s] as a made name: its letters and digits, each run of anything else one _; "" when it has none (Chinese alone). */
export const asFileName = (s: string) =>
  s
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)
    .replace(/_+$/, "");

/** [base], or the first of [base]_2, [base]_3 … that [taken] hasn't. */
export function uniqueName(base: string, taken: Set<string>) {
  let name = base;
  for (let n = 2; taken.has(name); n++) name = `${base}_${n}`;
  return name;
}

/** Refused unless [name] is a file name; an empty one too where the file may have none ([optional]: a block). */
export function mustBeFileName(name: string, optional = false) {
  if (optional && !name) return;
  if (!isFileName(name)) throw new CmsError("errors.fileName", { name });
}

/**
 * Every block, style and layout whose name isn't a file name renamed (the files of before, and the first content), its
 * versions with it, so none of them reads as changed: a block by the address of the first page it stands on and its type
 * (contact_page_title), a style by its type (hero_banner_style), a layout as layout; each unique in its kind.
 */
export async function nameFiles(db: Db) {
  const pages = (
    await db.query<{ path: string; blocks: { id: string }[] }>(
      `select path, blocks from pages where not deleted order by path`,
    )
  ).rows;
  const pageOf = (id: string) => pages.find((p) => p.blocks.some((b) => b.id === id));
  const kinds: { kind: string; table: string; made: (r: { id: string; type?: string }) => string }[] = [
    {
      kind: "component",
      table: "components",
      made: (r) => {
        const page = pageOf(r.id);
        const where = page ? asFileName(page.path) || "home" : "";
        return where ? `${where}_${r.type}` : r.type!;
      },
    },
    { kind: "template", table: "templates", made: (r) => `${r.type}_style` },
    { kind: "layout", table: "layouts", made: () => "layout" },
  ];
  for (const k of kinds) {
    const rows = (
      await db.query<{ id: string; name: string; type?: string }>(
        `select * from ${k.table} order by ${k.table === "layouts" ? "id" : "type, id"}`,
      )
    ).rows;
    const taken = new Set(rows.flatMap((r) => (isFileName(r.name) ? [r.name] : [])));
    for (const r of rows) {
      let name = r.name;
      if (name && !isFileName(name)) {
        name = uniqueName(asFileName(name) || k.made(r), taken);
        taken.add(name);
        await db.query(`update ${k.table} set name = $2 where id = $1`, [r.id, name]);
      }
      if (!name) continue;
      // Its versions with it, each whose name isn't one: a name is no content, so a file renamed reads as it was.
      await db.query(
        `update revisions set data = jsonb_set(data, '{name}', to_jsonb($2::text))
          where kind = $3 and entity_id = $1 and data is not null and data ? 'name'
            and not (data->>'name' ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$')`,
        [r.id, name, k.kind],
      );
    }
  }
}
