/**
 * What the pages hand their client parts, in the reader's language: a file's state (`FileView`), a version, a date.
 * Server side; the parts that show them are in src/components/files.tsx.
 */
import type { Field } from "./catalog";
import { labelIn } from "./labels";
import type { Bell, Job } from "./jobs";
import type { PageRow, Working } from "./store";
import type { Dependency, FileInfo, Version } from "./workflow";
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
  /** The job it is in (S7), while in the workflow. */
  job?: { id: number; name: string; ticket: string };
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
  job: f.job,
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

/** A workflow job as the lists show it (S7): its dates as [lang] writes them. */
export type JobView = Omit<Job, "created_at" | "updated_at" | "scheduled_at"> & {
  created: string;
  at: string;
  scheduled: string;
};

export const jobView = (j: Job, lang: Lang): JobView => {
  const { created_at, updated_at, scheduled_at, ...rest } = j;
  return {
    ...rest,
    created: when(created_at, lang),
    at: when(updated_at, lang),
    scheduled: when(scheduled_at, lang),
  };
};

/** The bell (S7) with its times as [lang] writes them. */
export const bellView = (b: Bell, lang: Lang): Bell => ({
  approvals: b.approvals.map((a) => ({ ...a, at: when(a.at, lang) })),
  news: b.news.map((n) => ({
    ...n,
    at: when(n.at, lang),
    note: n.action === "scheduled" ? when(n.note, lang) : n.note,
  })),
  unread: b.unread,
});

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

/**
 * A dependency (依赖) as 我的文件 and 加入工作流 show it: its name and editor, the files it comes from, and where it is
 * (the owner: 「用户不知道去哪里找」): its folder in the explorer, with its type's name for a block or a style.
 */
export type DependencyView = {
  kind: Dependency["kind"];
  id: string;
  label: string;
  href: string;
  state: Dependency["state"];
  owner?: string;
  from: { label: string; href: string }[];
  at: string;
  type?: string;
};

/** [deps] in [lang]: names from [work] (workingStates), a type's name by [typeName]. */
export function dependencyViews(
  deps: Dependency[],
  work: Map<string, Working>,
  lang: Lang,
  typeName: (type: string) => string,
): DependencyView[] {
  const name = (i: { kind: string; id: string }) => work.get(`${i.kind}:${i.id}`)?.label[lang] ?? i.id;
  return deps.map((d) => {
    const type = (work.get(`${d.kind}:${d.id}`)?.state as { type?: string } | undefined)?.type;
    const folder =
      d.kind === "component"
        ? "content/components"
        : d.kind === "template"
          ? "views/styles"
          : "views/layouts";
    return {
      kind: d.kind,
      id: d.id,
      label: name(d),
      href: fileHref(d.kind, d.id),
      state: d.state,
      owner: d.owner,
      from: d.from.map((f) => ({ label: name(f), href: fileHref(f.kind, f.id) })),
      at: type && d.kind !== "layout" ? `${folder}/${type}` : folder,
      ...(type && d.kind !== "layout" && { type: typeName(type) }),
    };
  });
}
