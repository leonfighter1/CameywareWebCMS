import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Frame } from "@/components/frame";
import { TYPES } from "@/lib/catalog";
import { labelIn } from "@/lib/labels";
import { previewBase } from "@/lib/hosts";
import { fileViews, pageUses, versionView } from "@/lib/present";
import { database, host, language, requireUser } from "@/lib/server";
import { getPage, listComponents, listLayouts, listPages, listTemplates } from "@/lib/store";
import { files, versions } from "@/lib/workflow";
import { isBuiltinLayout, LAYOUTS, zonesOfMarkup } from "@/generated/layouts";
import { PageEditor, type StyleInfo } from "./editor";

/**
 * A page's editor (S4, the owner: 「page里的内容是由不同的component组成的」, after Bell's WebPage): its settings and its
 * layout, then each zone of the layout with its components in order, each with the style it is drawn in there.
 */
export default async function PageEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const lang = await language();
  const pg = await database();
  const page = await getPage(pg, id);
  if (!page) notFound();
  const [comps, templates, layouts, all, past] = await Promise.all([
    listComponents(pg),
    listTemplates(pg),
    listLayouts(pg),
    files(pg),
    versions(pg, "page", id),
  ]);
  const views = fileViews(all, lang);
  const byId = new Map(comps.map((c) => [c.id, c]));
  const typeName = (type: string) => (TYPES[type] ? labelIn(TYPES[type], lang) : type);
  const file = views[`page:${id}`];
  if (!file) notFound();
  const custom = layouts.filter((l) => !l.deleted);
  const zonesOf = (layout: string) =>
    isBuiltinLayout(layout)
      ? LAYOUTS[layout]!.zones.map((z) => ({
          name: z.name,
          label: lang === "en" ? z.label_en : z.label,
          full: !!z.full,
        }))
      : zonesOfMarkup(custom.find((l) => l.id === layout)?.markup ?? "").map((name) => ({
          name,
          label: name,
          full: false,
        }));
  // Each type's styles with where they are used (the Browse dialog's 「Used in Pages」 and its count).
  const pages = (await listPages(pg)).filter((p) => !p.deleted);
  const typeOf = new Map(comps.map((c) => [c.id, c.type]));
  const usedIn = (type: string, style: string | undefined) =>
    pages
      .filter((p) => p.blocks.some((b) => typeOf.get(b.id) === type && (b.style ?? undefined) === style))
      .map((p) => p.path);
  const builtinName = (await getTranslations("page"))("builtinStyle");
  const site = `${previewBase(await host())}/${lang === "en" ? "en" : "zh"}`;
  const styleName = (s: string | undefined) =>
    s ? (templates.find((x) => x.id === s)?.name ?? s) : builtinName;
  const styles: Record<string, StyleInfo[]> = {};
  for (const type of Object.keys(TYPES)) {
    const at = usedIn(type, undefined);
    styles[type] = [{ value: "builtin", label: builtinName, uses: at.length, pages: at }];
  }
  for (const t of templates.filter((x) => !x.deleted)) {
    const at = usedIn(t.type, t.id);
    (styles[t.type] ??= []).push({ value: t.id, label: t.name, uses: at.length, pages: at });
  }
  return (
    <Frame>
      <PageEditor
        // Drawn again when the page changed under it (a discard, a version restored): its fields start from it.
        key={`${page.updated_at}`}
        me={user.login}
        file={file}
        versions={past.map((v) => versionView(v, lang))}
        page={{
          id: page.id,
          name: page.name,
          path: page.path,
          status: page.status,
          title: page.title,
          description: page.description,
          layout: page.layout,
          breadcrumb: page.breadcrumb,
          sitemap: page.sitemap,
          deleted: page.deleted,
        }}
        placements={page.blocks.map((b) => {
          const c = byId.get(b.id);
          return {
            id: b.id,
            zone: b.zone,
            row: b.row,
            style: b.style,
            type: c?.type ?? "",
            label: c ? typeName(c.type) : "?",
            name: c?.name ?? "",
            missing: !c || c.deleted,
            file: views[`component:${b.id}`],
          };
        })}
        layouts={[
          ...Object.entries(LAYOUTS).map(([name, l]) => ({
            value: name,
            label: lang === "en" ? l.label_en : l.label,
            description: lang === "en" ? l.description_en : l.description,
          })),
          ...custom.map((l) => ({ value: l.id, label: l.name, description: "" })),
        ]}
        zones={Object.fromEntries(
          [...Object.keys(LAYOUTS), ...custom.map((l) => l.id)].map((name) => [name, zonesOf(name)]),
        )}
        styles={styles}
        library={comps
          .filter((c) => !c.deleted)
          .map((c) => ({
            id: c.id,
            type: c.type,
            name: c.name || c.id,
            file: views[`component:${c.id}`],
            uses: pageUses(pages, c.id, { lang, site, anchor: c.data.anchor, style: styleName }),
          }))}
        types={Object.entries(TYPES).map(([value, d]) => ({ value, label: labelIn(d, lang) }))}
        preview={`${site}${page.path}?view=draft`}
      />
    </Frame>
  );
}
