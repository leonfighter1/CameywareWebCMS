/**
 * Resource bundles (the owner, 2026-11-16, of Bell's Common/Components/ResourceBundles: 「contains all keys and values of
 * all rescourse form the website … need to be centeralized」; T2): the UI texts by their namespace, the first part of the
 * key (nav.signIn → nav), each bundle one file, taken, checked in and versioned whole. The texts stay a row each in the
 * working copy (`texts`); a bundle's state is its keys and their values.
 */
import type { Transaction } from "@electric-sql/pglite";
import { canonical } from "./json";
import { type Both, MESSAGES } from "./words";
import type { L10n } from "@/generated/model";

/** The bundle a text's key is in. */
export const bundleOf = (key: string) => key.split(".")[0]!;

/** A bundle's name in both languages: its namespace and what it holds (messages bundleNames), or the namespace alone. */
export function bundleLabel(ns: string): Both {
  const name = (lang: "zh" | "en") => (MESSAGES[lang].bundleNames as Record<string, string>)[ns];
  return { zh: name("zh") ? `${ns} · ${name("zh")}` : ns, en: name("en") ? `${ns} · ${name("en")}` : ns };
}

/** A bundle's state: its texts by key, in order. */
export const bundleState = (texts: { key: string; value: L10n }[]) =>
  Object.fromEntries([...texts].sort((a, b) => a.key.localeCompare(b.key)).map((t) => [t.key, t.value]));

type TextItem = {
  id: string;
  status: string;
  owner: string | null;
  since: string;
  prod_revision_id: number | null;
};

/**
 * Migration 3: the text files merged into bundle files. Each bundle's production version is its texts' production
 * versions together; each release's manifest names its bundles' versions instead of its texts' (made once per distinct
 * content), so production can still go back to it. A bundle with a text someone held (checked out or in the workflow)
 * is checked out to whoever took one last; every change stays in the working copy. The texts' own versions stay as
 * they were (their history).
 */
export async function bundlesFromTexts(tx: Transaction) {
  const items = (await tx.query<TextItem>(`select * from items where kind = 'text'`)).rows;
  const spaces = (await tx.query<{ ns: string }>(`select distinct split_part(key, '.', 1) as ns from texts`))
    .rows;
  if (!items.length && !spaces.length) return;
  const releases = (
    await tx.query<{ id: number; manifest: Record<string, number> }>(
      `select id, manifest from releases where manifest is not null`,
    )
  ).rows;
  const ids = new Set<number>();
  for (const i of items) if (i.prod_revision_id) ids.add(Number(i.prod_revision_id));
  for (const r of releases)
    for (const [k, id] of Object.entries(r.manifest)) if (k.startsWith("text:")) ids.add(Number(id));
  const revs = (
    await tx.query<{ id: number; entity_id: string; data: L10n | null; deleted: boolean }>(
      `select id, entity_id, data, deleted from revisions where kind = 'text' and id = any($1::bigint[])`,
      [[...ids]],
    )
  ).rows;
  const byId = new Map(revs.map((r) => [Number(r.id), r]));
  const checkin = Number(
    (
      await tx.query<{ id: number }>(
        `insert into checkins (id, message, author, items)
           values ((select coalesce(max(id), 0) + 1 from checkins), $1, 'system', '[]') returning id`,
        ["资源包：界面文字按命名空间合并为资源包 (resource bundles: the UI texts merged by namespace)"],
      )
    ).rows[0]!.id,
  );
  const made = new Map<string, number>();
  /** The bundle [ns] of these text versions: a revision, one per distinct content. */
  const bundleRevision = async (ns: string, versions: number[]) => {
    const texts = versions.flatMap((id) => {
      const r = byId.get(id);
      return r && !r.deleted && r.data ? [{ key: r.entity_id, value: r.data }] : [];
    });
    if (!texts.length) return null;
    const state = bundleState(texts);
    const key = `${ns}\u0000${canonical(state)}`;
    if (!made.has(key)) {
      const { rows } = await tx.query<{ id: number }>(
        `insert into revisions (kind, entity_id, data, deleted, checkin_id, author)
           values ('bundle', $1, $2, false, $3, 'system') returning id`,
        [ns, JSON.stringify(state), checkin],
      );
      made.set(key, Number(rows[0]!.id));
    }
    return made.get(key)!;
  };
  const groups = new Map<string, TextItem[]>(spaces.map((s) => [s.ns, []]));
  for (const i of items) {
    const ns = bundleOf(i.id);
    groups.set(ns, [...(groups.get(ns) ?? []), i]);
  }
  for (const [ns, list] of groups) {
    const prod = await bundleRevision(
      ns,
      list.flatMap((i) => (i.prod_revision_id ? [Number(i.prod_revision_id)] : [])),
    );
    const held = list
      .filter((i) => i.status !== "available" && i.owner)
      .sort((a, b) => new Date(b.since).getTime() - new Date(a.since).getTime())[0];
    await tx.query(
      `insert into items (kind, id, status, owner, prod_revision_id) values ('bundle', $1, $2, $3, $4)`,
      [ns, held ? "checked_out" : "available", held?.owner ?? null, prod],
    );
  }
  for (const r of releases) {
    const manifest: Record<string, number> = {};
    const bySpace = new Map<string, number[]>();
    for (const [k, id] of Object.entries(r.manifest)) {
      if (!k.startsWith("text:")) manifest[k] = id;
      else {
        const ns = bundleOf(k.slice(5));
        bySpace.set(ns, [...(bySpace.get(ns) ?? []), Number(id)]);
      }
    }
    for (const [ns, versions] of bySpace) {
      const b = await bundleRevision(ns, versions);
      if (b) manifest[`bundle:${ns}`] = b;
    }
    await tx.query(`update releases set manifest = $2 where id = $1`, [r.id, JSON.stringify(manifest)]);
  }
  await tx.query(`delete from items where kind = 'text'`);
}
