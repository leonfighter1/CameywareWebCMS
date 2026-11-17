/**
 * What the pages hand their client parts, in the reader's language: a file's state (`FileView`), a version, a date.
 * Server side; the parts that show them are in src/components/files.tsx.
 */
import type { Field } from "./catalog";
import { labelIn } from "./labels";
import type { PageRow } from "./store";
import type { FileInfo, Version } from "./workflow";
import type { Lang } from "./words";
import { pick } from "@/generated/model";

/** A date and time as [lang] writes it. */
export const when = (at: string | Date | null | undefined, lang: Lang) =>
  at ? new Date(at).toLocaleString(lang === "en" ? "en-CA" : "zh-CN", { hour12: false }) : "";

export type FileView = {
  kind: FileInfo["kind"];
  id: string;
  label: string;
  status: FileInfo["status"];
  owner: string | null;
  since: string;
  stage: FileInfo["stage"];
  change?: FileInfo["change"];
  busy: boolean;
  checkin?: { id: number; message: string; author: string; at: string };
  /** When its working copy was saved last (as [lang] writes it, and as a time to sort by), and by whom. */
  at: string;
  atTime: number;
  by: string;
  deleted: boolean;
  /** Never published: production has no version of it. */
  fresh: boolean;
};

export const fileView = (f: FileInfo, lang: Lang): FileView => ({
  kind: f.kind,
  id: f.id,
  label: f.label[lang],
  status: f.status,
  owner: f.owner,
  since: when(f.since, lang),
  stage: f.stage,
  change: f.change,
  busy: f.busy,
  checkin: f.checkin && { ...f.checkin, at: when(f.checkin.at, lang) },
  at: when(f.at, lang),
  atTime: new Date(f.at).getTime(),
  by: f.by,
  deleted: f.deleted,
  fresh: !f.prod_revision_id,
});

/** Every file's view, by `kind:id`. */
export const fileViews = (all: FileInfo[], lang: Lang) =>
  Object.fromEntries(all.map((f) => [`${f.kind}:${f.id}`, fileView(f, lang)])) as Record<string, FileView>;

export type VersionView = Omit<Version, "data" | "created_at"> & { at: string };

export const versionView = (v: Version, lang: Lang): VersionView => {
  const { data: _data, created_at, ...rest } = v;
  void _data;
  return { ...rest, at: when(created_at, lang) };
};

/** A field as a template's writer reads it: its name, its kind, its label in [lang], its options, its items' fields. */
export type FieldRef = { name: string; kind: string; label: string; options?: string[]; fields?: FieldRef[] };

export const fieldRefs = (fields: Field[], lang: Lang): FieldRef[] =>
  fields.map((f) => ({
    name: f.name,
    kind: f.kind,
    label: labelIn(f, lang),
    ...(f.options && { options: f.options.map((o) => o.value) }),
    ...(f.fields && { fields: fieldRefs(f.fields, lang) }),
  }));

/** A page a block stands on: its address, title, whether it is on the site, its draft in the preview, its places. */
export type PageUse = {
  id: string;
  path: string;
  title: string;
  active: boolean;
  draft: string;
  places: { zone: string; style: string }[];
};

/**
 * The pages among [pages] (not deleted) that show block [id], each with every place it has there (a block can stand on
 * a page more than once): [site] is the preview in the reader's language (a page's draft is [site][path]?view=draft,
 * at the block's [anchor]), [style] a place's style by name.
 */
export function pageUses(
  pages: PageRow[],
  id: string,
  o: { lang: Lang; site: string; anchor?: unknown; style: (template: string | undefined) => string },
): PageUse[] {
  const anchor = typeof o.anchor === "string" && o.anchor ? `#${o.anchor}` : "";
  return pages.flatMap((p) => {
    const at = p.deleted ? [] : p.blocks.filter((b) => b.id === id);
    if (!at.length) return [];
    return [
      {
        id: p.id,
        path: p.path,
        title: pick(p.title, o.lang),
        active: p.status === "active",
        draft: `${o.site}${p.path}?view=draft${anchor}`,
        places: at.map((b) => ({ zone: b.zone, style: o.style(b.style) })),
      },
    ];
  });
}

/** An editor's link to a file. */
export const fileHref = (kind: FileInfo["kind"], id: string) =>
  ({
    page: `/pages/${id}`,
    component: `/components/${id}`,
    template: `/templates/${id}`,
    layout: `/layouts/${id}`,
    global: `/globals/${id}/`,
    bundle: `/bundles/${encodeURIComponent(id)}`,
    code: `/templates/builtin/${id}`,
  })[kind];
