import { Frame } from "@/components/frame";
import { bundleOf } from "@/lib/bundles";
import { TYPES } from "@/lib/catalog";
import { cmsSiteBuilding } from "@/lib/deploy";
import { previewBase } from "@/lib/hosts";
import { labelIn } from "@/lib/labels";
import { fileHref, fileViews } from "@/lib/present";
import { environments } from "@/lib/releases";
import { database, host, language, requireUser } from "@/lib/server";
import { listComponents, listPages, listTemplates, listTexts } from "@/lib/store";
import { files } from "@/lib/workflow";
import { type Entry, Explorer } from "./explorer";

/**
 * The explorer, the CMS's central page (the owner, 2026-11-16, of Bell's CMS.Net: 「content contains files of each type
 * … another component style that also have related matched path with all templates related to this content … a kind of
 * CMS dashboard can view who is doing what」; T3): a fixed tree, 内容 (页面, 组件/<类型>, 公共/资源包, 公共/全局资料) and
 * 视图 (组件样式/<类型>), the content's type folders and the styles' matched by the type; each folder's files with their
 * state, their last change and who made it; at the root, who is doing what.
 */
export default async function ExplorerPage({ searchParams }: { searchParams: Promise<{ at?: string }> }) {
  const { at = "" } = await searchParams;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const [pages, comps, templates, texts, all, envs] = await Promise.all([
    listPages(pg),
    listComponents(pg),
    listTemplates(pg),
    listTexts(pg),
    files(pg),
    environments(pg),
  ]);
  const views = fileViews(all, lang);
  const live = pages.filter((p) => !p.deleted);
  const names = new Map(templates.map((t) => [t.id, t.name]));
  const entries: Entry[] = [];
  const add = (e: Omit<Entry, "file" | "href">, kind: Parameters<typeof fileHref>[0], id: string) => {
    const file = views[`${kind}:${id}`];
    if (file) entries.push({ ...e, file, href: fileHref(kind, id) });
  };
  for (const p of pages)
    add(
      {
        key: `page:${p.id}`,
        folder: "content/pages",
        name: p.path,
        mono: true,
        title: (lang === "en" ? p.title.en : undefined) || p.title.zh || "",
        active: p.status === "active",
        blocks: p.blocks.length,
      },
      "page",
      p.id,
    );
  for (const c of comps)
    add(
      {
        key: `component:${c.id}`,
        folder: `content/components/${c.type}`,
        name: c.name || c.id,
        template: c.template ? (names.get(c.template) ?? c.template) : undefined,
        pages: live.filter((p) => p.blocks.includes(c.id)).length,
      },
      "component",
      c.id,
    );
  for (const type of Object.keys(TYPES))
    entries.push({
      key: `builtin:${type}`,
      folder: `views/styles/${type}`,
      name: "",
      href: `/templates/builtin/${type}`,
      builtin: true,
      blocks: comps.filter((c) => c.type === type && !c.deleted && !c.template).length,
    });
  for (const t of templates)
    add(
      {
        key: `template:${t.id}`,
        folder: `views/styles/${t.type}`,
        name: t.name,
        blocks: comps.filter((c) => !c.deleted && c.template === t.id).length,
      },
      "template",
      t.id,
    );
  const count = new Map<string, number>();
  for (const t of texts) count.set(bundleOf(t.key), (count.get(bundleOf(t.key)) ?? 0) + 1);
  for (const f of all) {
    if (f.kind === "global")
      add({ key: `global:${f.id}`, folder: "content/common/globals", name: f.label[lang] }, "global", f.id);
    if (f.kind === "bundle")
      add(
        {
          key: `bundle:${f.id}`,
          folder: "content/common/bundles",
          name: f.label[lang],
          mono: true,
          texts: count.get(f.id) ?? 0,
        },
        "bundle",
        f.id,
      );
  }
  return (
    <Frame>
      <Explorer
        me={user.login}
        at={at}
        entries={entries}
        types={Object.entries(TYPES).map(([type, d]) => ({ type, label: labelIn(d, lang) }))}
        preview={previewBase(await host())}
        releases={{ preview: envs.preview.release, production: envs.production.release }}
        building={cmsSiteBuilding()}
      />
    </Frame>
  );
}
